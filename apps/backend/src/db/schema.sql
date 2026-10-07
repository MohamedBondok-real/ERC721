-- BreastCare AI — PostgreSQL schema
--
-- Apply with:  npm run db:init -w @breastcare/backend
--
-- Design notes
--   * Sensitive narrative clinical text is stored encrypted at rest by the application
--     (AES-256-GCM). The column types below are plain text; the ciphertext is what lands
--     in them.
--   * Structured sub-documents (symptom factors, meal suggestions, dose history) are
--     JSONB. They are always scoped to a row that carries `patient_id`, so row-level
--     security policies apply to the whole document.
--   * No clinical content is ever written to the blockchain. The `*_hash` columns below
--     hold the digests that get anchored on-chain.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  role              TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
  display_name      TEXT NOT NULL,
  wallet_address    TEXT,
  pseudonymous_id   TEXT,
  password_hash     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);

-- The driver maps camelCase domain properties onto these columns; quoted identifiers in
-- the queries use the camelCase names, so the physical columns keep the same spelling.
ALTER TABLE users RENAME COLUMN display_name TO "displayName";
ALTER TABLE users RENAME COLUMN wallet_address TO "walletAddress";
ALTER TABLE users RENAME COLUMN pseudonymous_id TO "pseudonymousId";
ALTER TABLE users RENAME COLUMN password_hash TO "passwordHash";
ALTER TABLE users RENAME COLUMN last_login_at TO "lastLoginAt";
ALTER TABLE users RENAME COLUMN created_at TO "createdAt";
ALTER TABLE users RENAME COLUMN updated_at TO "updatedAt";

CREATE TABLE IF NOT EXISTS patients (
  id                        TEXT PRIMARY KEY,
  "userId"                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "pseudonymousId"          TEXT NOT NULL,
  "displayName"             TEXT NOT NULL,
  "birthYear"               INTEGER NOT NULL,
  age                       INTEGER NOT NULL,
  "biologicalSex"           TEXT NOT NULL,
  region                    TEXT NOT NULL,
  "primaryDoctorId"         TEXT,
  "walletAddress"           TEXT,
  "onChainRegistered"       BOOLEAN NOT NULL DEFAULT FALSE,
  "onChainPatientId"        TEXT,
  "bloodType"               TEXT,
  allergies                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  comorbidities             JSONB NOT NULL DEFAULT '[]'::jsonb,
  "currentTreatmentPhase"   TEXT NOT NULL DEFAULT 'not-in-treatment',
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"               TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS patients_user_idx ON patients ("userId");
CREATE INDEX IF NOT EXISTS patients_doctor_idx ON patients ("primaryDoctorId");

CREATE TABLE IF NOT EXISTS doctors (
  id                TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "displayName"     TEXT NOT NULL,
  specialty         TEXT NOT NULL,
  "licenseNumber"   TEXT NOT NULL,
  institution       TEXT NOT NULL,
  email             TEXT NOT NULL,
  "walletAddress"   TEXT,
  "acceptedPatients" INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doctors_user_idx ON doctors ("userId");

-- ---------------------------------------------------------------------------
-- Clinical records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS medical_records (
  id                  TEXT PRIMARY KEY,
  "patientId"         TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL,
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  body                TEXT NOT NULL,
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  "recordedById"      TEXT REFERENCES users(id) ON DELETE SET NULL,
  "contentHash"       TEXT NOT NULL,
  "onChainRecordId"   TEXT,
  "verifiedAt"        TIMESTAMPTZ,
  "lastVerification"  JSONB,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS medical_records_patient_idx ON medical_records ("patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS medical_records_hash_idx ON medical_records ("contentHash");

CREATE TABLE IF NOT EXISTS symptom_reports (
  id                  TEXT PRIMARY KEY,
  "patientId"         TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  label               TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
  side                TEXT NOT NULL,
  "durationWeeks"     INTEGER NOT NULL,
  progressive         BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  "reportedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  guidance            TEXT NOT NULL,
  "redFlag"           BOOLEAN NOT NULL DEFAULT FALSE,
  "reviewedByDoctorId" TEXT,
  "reviewedAt"        TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS symptom_reports_patient_idx ON symptom_reports ("patientId", "reportedAt" DESC);
CREATE INDEX IF NOT EXISTS symptom_reports_redflag_idx ON symptom_reports ("redFlag") WHERE "redFlag" = TRUE;

CREATE TABLE IF NOT EXISTS risk_assessments (
  id                  TEXT PRIMARY KEY,
  "patientId"         TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "modelId"           TEXT NOT NULL,
  "modelVersion"      TEXT NOT NULL,
  level               TEXT NOT NULL CHECK (level IN ('low', 'moderate', 'high')),
  score               INTEGER NOT NULL,
  "maxScore"          INTEGER NOT NULL,
  "normalizedScore"   NUMERIC NOT NULL,
  urgency             TEXT NOT NULL CHECK (urgency IN ('routine', 'soon', 'prompt')),
  input               JSONB NOT NULL,
  factors             JSONB NOT NULL DEFAULT '[]'::jsonb,
  guidance            JSONB NOT NULL DEFAULT '[]'::jsonb,
  "redFlags"          JSONB NOT NULL DEFAULT '[]'::jsonb,
  disclaimer          TEXT NOT NULL DEFAULT '',
  "contentHash"       TEXT NOT NULL,
  "onChainRecordId"   TEXT,
  "completedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "reviewedByDoctorId" TEXT,
  "doctorNote"        TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_assessments_patient_idx ON risk_assessments ("patientId", "completedAt" DESC);
CREATE INDEX IF NOT EXISTS risk_assessments_level_idx ON risk_assessments (level);

-- ---------------------------------------------------------------------------
-- Nutrition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nutrition_plans (
  id                              TEXT PRIMARY KEY,
  "patientId"                     TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  phase                           TEXT NOT NULL,
  title                           TEXT NOT NULL,
  "createdBy"                     TEXT NOT NULL,
  "reviewedByProfessional"        BOOLEAN NOT NULL DEFAULT FALSE,
  "calorieTargetKcal"             INTEGER,
  "proteinTargetGrams"            INTEGER,
  "hydrationTargetMl"             INTEGER NOT NULL DEFAULT 2000,
  goals                           JSONB NOT NULL DEFAULT '[]'::jsonb,
  meals                           JSONB NOT NULL DEFAULT '[]'::jsonb,
  "foodsToEmphasize"              JSONB NOT NULL DEFAULT '[]'::jsonb,
  "foodsToDiscussWithClinician"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  "foodsThatMayWorsenSymptoms"    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sideEffectSupport"             JSONB NOT NULL DEFAULT '[]'::jsonb,
  cautions                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "contentHash"                   TEXT NOT NULL,
  "createdAt"                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  disclaimer                      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS nutrition_plans_patient_idx ON nutrition_plans ("patientId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id              TEXT PRIMARY KEY,
  "patientId"     TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "loggedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  slot            TEXT NOT NULL,
  description     TEXT NOT NULL,
  adherence       TEXT NOT NULL CHECK (adherence IN ('followed', 'partial', 'skipped')),
  "appetiteScore" INTEGER NOT NULL,
  "nauseaScore"   INTEGER NOT NULL,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutrition_logs_patient_idx ON nutrition_logs ("patientId", "loggedAt" DESC);

-- ---------------------------------------------------------------------------
-- Treatment & medication
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS treatments (
  id                    TEXT PRIMARY KEY,
  "patientId"           TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  modality              TEXT NOT NULL,
  status                TEXT NOT NULL,
  "startDate"           TIMESTAMPTZ,
  "expectedEndDate"     TIMESTAMPTZ,
  "treatingDoctorId"    TEXT REFERENCES users(id) ON DELETE SET NULL,
  summary               TEXT NOT NULL,
  notes                 TEXT NOT NULL DEFAULT '',
  "sideEffects"         JSONB NOT NULL DEFAULT '[]'::jsonb,
  "progressPercent"     INTEGER NOT NULL DEFAULT 0 CHECK ("progressPercent" BETWEEN 0 AND 100),
  documents             JSONB NOT NULL DEFAULT '[]'::jsonb,
  appointments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  "contentHash"         TEXT NOT NULL,
  "onChainPlanId"       TEXT,
  "authorizedByDoctorId" TEXT,
  "authorizedAt"        TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS treatments_patient_idx ON treatments ("patientId", status);
CREATE INDEX IF NOT EXISTS treatments_doctor_idx ON treatments ("treatingDoctorId");

CREATE TABLE IF NOT EXISTS medications (
  id                TEXT PRIMARY KEY,
  "patientId"       TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  "activeIngredient" TEXT NOT NULL,
  dosage            TEXT NOT NULL,
  route             TEXT NOT NULL,
  frequency         TEXT NOT NULL,
  "scheduledTimes"  JSONB NOT NULL DEFAULT '[]'::jsonb,
  "startDate"       TIMESTAMPTZ NOT NULL,
  "endDate"         TIMESTAMPTZ,
  status            TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'discontinued')),
  "prescriberId"    TEXT REFERENCES users(id) ON DELETE SET NULL,
  instructions      TEXT NOT NULL DEFAULT '',
  cautions          TEXT NOT NULL DEFAULT '',
  "reminderEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  doses             JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS medications_patient_idx ON medications ("patientId", status);

-- ---------------------------------------------------------------------------
-- Appointments, reports, consent, notifications, audit, blockchain anchors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  "patientId"   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "doctorId"    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "startsAt"    TIMESTAMPTZ NOT NULL,
  "endsAt"      TIMESTAMPTZ NOT NULL,
  reason        TEXT NOT NULL,
  modality      TEXT NOT NULL DEFAULT 'in-person',
  status        TEXT NOT NULL DEFAULT 'requested',
  location      TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  "reminderSent" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS appointments_doctor_idx ON appointments ("doctorId", "startsAt");
CREATE INDEX IF NOT EXISTS appointments_patient_idx ON appointments ("patientId", "startsAt");

CREATE TABLE IF NOT EXISTS medical_reports (
  id                    TEXT PRIMARY KEY,
  "patientId"           TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "doctorId"            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  date                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "clinicalNotes"       TEXT NOT NULL,
  assessment            TEXT NOT NULL,
  "treatmentInformation" TEXT NOT NULL DEFAULT '',
  recommendations       TEXT NOT NULL,
  "followUpDate"        TIMESTAMPTZ,
  "contentHash"         TEXT NOT NULL,
  "onChainRecordId"     TEXT,
  "lastVerification"    JSONB,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS medical_reports_patient_idx ON medical_reports ("patientId", date DESC);
CREATE INDEX IF NOT EXISTS medical_reports_doctor_idx ON medical_reports ("doctorId", date DESC);

CREATE TABLE IF NOT EXISTS consents (
  id                  TEXT PRIMARY KEY,
  "patientId"         TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "granteeId"         TEXT NOT NULL,
  "granteeType"       TEXT NOT NULL DEFAULT 'doctor',
  "granteeName"       TEXT NOT NULL,
  "scopeName"         TEXT NOT NULL,
  "scopeDescription"  TEXT NOT NULL,
  "scopeHash"         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  "grantedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"         TIMESTAMPTZ,
  "revokedAt"         TIMESTAMPTZ,
  signature           TEXT,
  "transactionHash"   TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consents_patient_idx ON consents ("patientId", status);
CREATE INDEX IF NOT EXISTS consents_grantee_idx ON consents ("granteeId", status);

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  "readAt"      TIMESTAMPTZ,
  "actionLabel" TEXT,
  "actionHref"  TEXT,
  severity      TEXT NOT NULL DEFAULT 'info',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  "actorId"       TEXT NOT NULL,
  "actorRole"     TEXT NOT NULL,
  action          TEXT NOT NULL,
  "patientId"     TEXT,
  resource        TEXT NOT NULL,
  "resourceId"    TEXT,
  "dataHash"      TEXT,
  "ipAddress"     TEXT,
  outcome         TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'failure')),
  "onChainEntryId" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs ("actorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS audit_logs_patient_idx ON audit_logs ("patientId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS blockchain_records (
  id                TEXT PRIMARY KEY,
  "patientId"       TEXT,
  kind              TEXT NOT NULL,
  label             TEXT NOT NULL,
  "dataHash"        TEXT NOT NULL,
  contract          TEXT NOT NULL,
  "transactionHash" TEXT,
  "blockNumber"     INTEGER,
  status            TEXT NOT NULL DEFAULT 'pending',
  verification      TEXT NOT NULL DEFAULT 'unverified',
  "confirmedAt"     TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blockchain_records_patient_idx ON blockchain_records ("patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS blockchain_records_hash_idx ON blockchain_records ("dataHash");

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Enabled on every table that carries patient data. The application connects with a
-- role that is NOT the table owner, so these policies are enforced. `app.patient_id`
-- and `app.actor_role` are set per transaction by the API before any query.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'medical_records', 'symptom_reports', 'risk_assessments', 'nutrition_plans',
    'nutrition_logs', 'treatments', 'medications', 'appointments', 'medical_reports',
    'consents', 'audit_logs', 'blockchain_records'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS patient_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY patient_isolation ON %I USING (
         current_setting(''app.actor_role'', true) = ''admin''
         OR current_setting(''app.actor_role'', true) = ''system''
         OR current_setting(''app.patient_id'', true) = "patientId"
       )', table_name);
  END LOOP;
END
$$;

COMMENT ON TABLE medical_records IS 'Off-chain clinical records. content_hash is anchored on-chain; the record body never is.';
COMMENT ON TABLE audit_logs IS 'Off-chain mirror of the on-chain audit trail. Neither table can be updated in place by the application.';
