import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  Search,
  ShieldOff,
  Stethoscope,
  Users,
} from "lucide-react";
import type { DoctorDashboardStats, RiskLevel } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import {
  Callout,
  DataTable,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ShortDisclaimer,
  StatCard,
  type Column,
} from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { RISK_COPY, TREATMENT_COPY } from "@/lib/format";
import { formatDate, fromNow } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

interface DoctorPatientRow {
  id: string;
  patientId: string;
  pseudonymousId: string;
  displayName: string;
  age: number;
  riskLevel: RiskLevel | null;
  riskAssessedAt: string | null;
  treatmentStatus: string;
  lastAppointment: string | null;
  nextAppointment: string | null;
  accessStatus: string;
  scopeName: string | null;
}

interface DoctorAlert {
  id: string;
  patientId: string;
  displayName: string;
  riskLevel: RiskLevel | null;
  urgency: string | null;
  redFlagSymptoms: string[];
  assessedAt: string | null;
}

export function DoctorDashboard() {
  const { user } = useAuth();

  const stats = useQuery({
    queryKey: queryKeys.doctor.dashboard,
    queryFn: ({ signal }) => api.get<DoctorDashboardStats>("/doctors/dashboard", undefined, signal),
  });

  const alerts = useQuery({
    queryKey: queryKeys.doctor.alerts,
    queryFn: ({ signal }) => api.get<{ alerts: DoctorAlert[] }>("/doctors/alerts", undefined, signal),
  });

  const patients = useQuery({
    queryKey: queryKeys.doctor.patients(""),
    queryFn: ({ signal }) => api.get<{ patients: DoctorPatientRow[]; total: number }>("/doctors/patients", undefined, signal),
  });

  const rows = patients.data?.patients ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Clinician workspace — ${user?.displayName ?? ""}`}
        description="You only see patients who have granted you active consent. Every record you open is audited."
        actions={
          <Button asChild>
            <Link to="/app/patients">
              <Users className="size-4" /> Open patient list
            </Link>
          </Button>
        }
      />

      <Callout tone="info" title="Consent-gated access">
        <p>
          This list is derived from active consent grants — there is no "all patients" view. If a patient revokes consent, they
          disappear from your workspace immediately, and the revocation is verifiable on-chain.
        </p>
      </Callout>

      {stats.error ? <ErrorState message="We couldn't load your dashboard." onRetry={() => void stats.refetch()} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Patients with consent" value={stats.data?.totalPatients ?? "—"} hint="Active grants" icon={<Users className="size-4" />} tone="accent" />
        <StatCard label="Upcoming appointments" value={stats.data?.upcomingAppointments ?? "—"} icon={<CalendarDays className="size-4" />} />
        <StatCard
          label="High risk indicators"
          value={stats.data?.highRiskPatients ?? "—"}
          hint="Educational indicator"
          icon={<AlertTriangle className="size-4" />}
          tone="destructive"
        />
        <StatCard label="Needing follow-up" value={stats.data?.patientsRequiringFollowUp ?? "—"} icon={<ClipboardList className="size-4" />} tone="warning" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Clinical alerts"
            description="Red-flag symptoms and non-low risk indicators across your consenting patients."
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/patients">All patients</Link>
              </Button>
            }
          />
          <CardContent>
            {alerts.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading alerts…</p>
            ) : alerts.data?.alerts.length ? (
              <ul className="space-y-2">
                {alerts.data.alerts.slice(0, 6).map((alert) => (
                  <li key={alert.patientId} className="rounded-lg border px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/app/patients/${alert.patientId}`} className="text-sm font-medium hover:underline">
                        {alert.displayName}
                      </Link>
                      {alert.riskLevel ? <Badge tone={RISK_COPY[alert.riskLevel].tone}>{alert.riskLevel}</Badge> : null}
                    </div>
                    {alert.redFlagSymptoms.length ? (
                      <p className="mt-1 text-xs text-destructive">
                        Flagged: {alert.redFlagSymptoms.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {alert.assessedAt ? `Assessed ${fromNow(alert.assessedAt)}` : "No assessment on file"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No alerts" description="Nothing currently needs your attention." icon={<Stethoscope className="size-5" />} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHead title="Your patients" description="Consent-derived, newest assessments first." />
          <CardContent>
            <DataTable<DoctorPatientRow>
              rows={rows}
              isLoading={patients.isLoading}
              columns={patientColumns}
              empty={<EmptyState title="No patients yet" description="Patients appear here once they grant you consent." icon={<Users className="size-5" />} />}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const patientColumns: Column<DoctorPatientRow>[] = [
  {
    key: "name",
    header: "Patient",
    cell: (row) => (
      <Link to={`/app/patients/${row.patientId}`} className="min-w-0 hover:underline">
        <p className="truncate font-medium">{row.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{row.pseudonymousId}</p>
      </Link>
    ),
  },
  { key: "age", header: "Age", cell: (row) => <span className="tabular-nums">{row.age}</span> },
  {
    key: "risk",
    header: "Risk indicator",
    cell: (row) => (row.riskLevel ? <Badge tone={RISK_COPY[row.riskLevel].tone}>{row.riskLevel}</Badge> : <span className="text-xs text-muted-foreground">Not assessed</span>),
  },
  {
    key: "treatment",
    header: "Treatment",
    cell: (row) =>
      row.treatmentStatus === "none" ? (
        <span className="text-xs text-muted-foreground">None</span>
      ) : (
        <Badge tone={TREATMENT_COPY[row.treatmentStatus as keyof typeof TREATMENT_COPY]?.tone ?? "muted"}>
          {TREATMENT_COPY[row.treatmentStatus as keyof typeof TREATMENT_COPY]?.label ?? row.treatmentStatus}
        </Badge>
      ),
  },
  {
    key: "next",
    header: "Next appointment",
    cell: (row) => <span className="whitespace-nowrap text-xs text-muted-foreground">{row.nextAppointment ? formatDate(row.nextAppointment) : "—"}</span>,
  },
];

/* ------------------------------------------------------------------ */
/* Patient list                                                        */
/* ------------------------------------------------------------------ */

export function DoctorPatients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  const patients = useQuery({
    queryKey: queryKeys.doctor.patients(term),
    queryFn: ({ signal }) => api.get<{ patients: DoctorPatientRow[]; total: number }>("/doctors/patients", { search: term || undefined }, signal),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Only patients with an active consent grant for you appear here."
        actions={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setTerm(search);
            }}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or pseudonym"
                className="w-64 pl-9"
                aria-label="Search patients"
              />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
        }
      />

      <ShortDisclaimer />

      {patients.error ? <ErrorState message="We couldn't load your patient list." onRetry={() => void patients.refetch()} /> : null}

      <DataTable<DoctorPatientRow>
        rows={patients.data?.patients}
        isLoading={patients.isLoading}
        columns={[
          ...patientColumns,
          {
            key: "scope",
            header: "Consent scope",
            cell: (row) => <span className="text-xs text-muted-foreground">{row.scopeName ?? "—"}</span>,
          },
          {
            key: "last",
            header: "Last seen",
            cell: (row) => <span className="whitespace-nowrap text-xs text-muted-foreground">{row.lastAppointment ? formatDate(row.lastAppointment) : "—"}</span>,
          },
        ]}
        onRowClick={(row) => navigate(`/app/patients/${row.patientId}`)}
        empty={
          <EmptyState
            title={term ? "No patients match that search" : "No patients yet"}
            description={term ? "Try a different name or pseudonym." : "Patients appear here once they grant you consent."}
            icon={<Users className="size-5" />}
          />
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Patient detail                                                      */
/* ------------------------------------------------------------------ */

interface AccessDecision {
  allowed: boolean;
  reason: string;
  onChainUnavailable: boolean;
  mismatch: boolean;
  consent: { granteeName: string; scopeName: string; grantedAt: string; expiresAt: string | null } | null;
}

const REASON_COPY: Record<string, string> = {
  self: "You are viewing your own record.",
  "consent-active": "This patient has granted you active consent for this scope.",
  "consent-active-not-anchored":
    "Consent is active in the platform record but was not anchored on-chain, so it cannot be independently verified.",
  "consent-active-on-chain-unavailable":
    "Consent is active in the platform record. The blockchain node is unreachable, so the on-chain state could not be checked.",
  "consent-revoked-on-chain":
    "The on-chain consent has been revoked. Access is denied even though a local record exists.",
  "no-active-consent": "This patient has not granted you consent. Ask them to grant access before requesting records.",
  "admin-has-no-implicit-access-to-clinical-records":
    "Administrators have no automatic access to clinical records. An explicit admin-review consent is required.",
  "patient-may-only-access-own-record": "A patient account can only open its own record.",
};

export function DoctorPatientDetail() {
  const { patientId = "" } = useParams();
  const queryClient = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const access = useQuery({
    queryKey: ["access", patientId],
    queryFn: ({ signal }) => api.get<AccessDecision>("/patients/access", { patientId }, signal),
    enabled: Boolean(patientId),
  });

  const overview = useQuery({
    queryKey: ["doctor", "patient", patientId, "overview"],
    queryFn: ({ signal }) => api.get<Record<string, unknown>>("/patients/overview", { patientId }, signal),
    enabled: Boolean(patientId) && access.data?.allowed === true,
  });

  const records = useQuery({
    queryKey: ["doctor", "patient", patientId, "records"],
    queryFn: ({ signal }) => api.get<{ records: { id: string; kind: string; title: string; summary: string; createdAt: string }[] }>(
      "/patients/records",
      { patientId },
      signal,
    ),
    enabled: Boolean(patientId) && access.data?.allowed === true,
  });

  const assessments = useQuery({
    queryKey: ["doctor", "patient", patientId, "risk"],
    queryFn: ({ signal }) =>
      api.get<{
        assessments: {
          id: string;
          level: RiskLevel;
          urgency: string;
          score: number;
          maxScore: number;
          modelId: string;
          modelVersion: string;
          completedAt: string;
          factors: { id: string; label: string; explanation: string }[];
          guidance: string[];
          disclaimer: string;
        }[];
      }>("/patients/risk-assessment", { patientId }, signal),
    enabled: Boolean(patientId) && access.data?.allowed === true,
  });

  if (access.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient record" />
        <p className="text-sm text-muted-foreground">Checking consent…</p>
      </div>
    );
  }

  if (access.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient record" />
        <ErrorState message={errorMessage(access.error)} />
      </div>
    );
  }

  const decision = access.data!;

  if (!decision.allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Access denied" description="This record is protected by consent." />
        <Callout tone="danger" title={REASON_COPY[decision.reason] ?? decision.reason}>
          <p>
            The platform checked for an active consent grant before reading anything, and the attempt has been written to the
            audit log. No clinical data was returned.
          </p>
        </Callout>
        <Button variant="outline" asChild>
          <Link to="/app/patients">Back to patient list</Link>
        </Button>
      </div>
    );
  }

  const profile = overview.data?.profile as
    | { displayName: string; pseudonymousId: string; age: number; currentTreatmentPhase: string; allergies: string[]; comorbidities: string[] }
    | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile?.displayName ?? "Patient record"}
        description={profile ? `${profile.pseudonymousId} · ${profile.age} years` : undefined}
        breadcrumb={
          <Link to="/app/patients" className="hover:underline">
            Patients
          </Link>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setNoteOpen(true)}>
              <ClipboardList className="size-4" /> Add note
            </Button>
            <Button onClick={() => setReportOpen(true)}>
              <FileText className="size-4" /> Write report
            </Button>
          </>
        }
      />

      <Callout tone="success" title={REASON_COPY[decision.reason] ?? decision.reason}>
        <p>
          Scope: {decision.consent?.scopeName ?? "—"}. Granted {decision.consent ? formatDate(decision.consent.grantedAt) : "—"}.
          {decision.onChainUnavailable
            ? " The blockchain node was unreachable, so this decision used the platform record only."
            : " The on-chain consent state agrees with the platform record."}
        </p>
      </Callout>

      {decision.mismatch ? (
        <Callout tone="danger" title="On-chain consent disagrees with the platform record">
          <p>
            The contract reports no active consent for this pairing. Treat this record as revoked until the discrepancy is
            resolved.
          </p>
        </Callout>
      ) : null}

      {profile ? (
        <Card>
          <CardHead title="Summary" />
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="Treatment phase" value={profile.currentTreatmentPhase.replace(/-/g, " ")} />
            <Item label="Allergies" value={profile.allergies.length ? profile.allergies.join(", ") : "None recorded"} />
            <Item label="Other conditions" value={profile.comorbidities.length ? profile.comorbidities.join(", ") : "None recorded"} />
            <Item label="Consent scope" value={decision.consent?.scopeName ?? "—"} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHead title="Risk assessment history" description="Educational indicators — never a diagnosis." />
        <CardContent className="space-y-3">
          {assessments.data?.assessments.length ? (
            assessments.data.assessments.map((assessment) => (
              <div key={assessment.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={RISK_COPY[assessment.level].tone}>{assessment.level}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {assessment.score}/{assessment.maxScore} · {assessment.modelId} v{assessment.modelVersion} ·{" "}
                    {formatDate(assessment.completedAt)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {assessment.factors.slice(0, 6).map((factor) => (
                    <li key={factor.id}>
                      <span className="font-medium text-foreground">{factor.label}</span> — {factor.explanation}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">{assessment.disclaimer}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No assessments on file" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHead title="Medical records" />
        <CardContent>
          <DataTable
            rows={records.data?.records ?? []}
            isLoading={records.isLoading}
            columns={[
              { key: "kind", header: "Type", cell: (row: { kind: string }) => <Badge tone="muted">{row.kind.replace(/-/g, " ")}</Badge> },
              { key: "title", header: "Record", cell: (row: { title: string; summary: string }) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.summary}</p>
                </div>
              ) },
              { key: "created", header: "Created", cell: (row: { createdAt: string }) => formatDate(row.createdAt) },
            ]}
            empty={<EmptyState title="No records yet" />}
          />
        </CardContent>
      </Card>

      <NoteDialog
        open={noteOpen}
        patientId={patientId}
        onClose={() => setNoteOpen(false)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["doctor", "patient", patientId, "records"] })}
      />

      <ReportDialog
        open={reportOpen}
        patientId={patientId}
        onClose={() => setReportOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.doctor.reports });
          toast.success("Report created and hashed");
        }}
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 capitalize">{value}</p>
    </div>
  );
}

function NoteDialog({ open, patientId, onClose, onSaved }: { open: boolean; patientId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: () => api.post(`/doctors/patients/${patientId}/notes`, { title: title || undefined, note }),
    onSuccess: () => {
      toast.success("Note added");
      setNote("");
      setTitle("");
      onClose();
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <ModalDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogHeader title="Add a clinical note" description="Stored as a hashed medical record on the patient's file." onClose={onClose} />
      <DialogBody className="space-y-4">
        <Field label="Title" htmlFor="note-title">
          <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Consultation note" />
        </Field>
        <Field label="Note" htmlFor="note-body" required>
          <Textarea id="note-body" rows={6} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={note.trim().length < 3}>
          Save note
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

function ReportDialog({ open, patientId, onClose, onSaved }: { open: boolean; patientId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [assessment, setAssessment] = useState("");
  const [treatmentInformation, setTreatmentInformation] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post("/patients/reports", {
        patientId,
        title,
        date,
        clinicalNotes,
        assessment,
        treatmentInformation,
        recommendations,
        followUpDate: followUpDate || null,
      }, { patientId }),
    onSuccess: () => {
      setTitle("");
      setClinicalNotes("");
      setAssessment("");
      setRecommendations("");
      onClose();
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <ModalDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogHeader
        title="Write a medical report"
        description="The report is hashed on save. Its hash is anchored on-chain when a node is reachable."
        onClose={onClose}
      />
      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="report-title" required>
            <Input id="report-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Oncology consultation" />
          </Field>
          <Field label="Date" htmlFor="report-date" required>
            <Input id="report-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>
        <Field label="Clinical notes" htmlFor="report-notes" required>
          <Textarea id="report-notes" rows={4} value={clinicalNotes} onChange={(event) => setClinicalNotes(event.target.value)} />
        </Field>
        <Field label="Assessment" htmlFor="report-assessment" required>
          <Textarea id="report-assessment" rows={3} value={assessment} onChange={(event) => setAssessment(event.target.value)} />
        </Field>
        <Field label="Treatment information" htmlFor="report-treatment">
          <Textarea id="report-treatment" rows={3} value={treatmentInformation} onChange={(event) => setTreatmentInformation(event.target.value)} />
        </Field>
        <Field label="Recommendations" htmlFor="report-recommendations" required>
          <Textarea id="report-recommendations" rows={3} value={recommendations} onChange={(event) => setRecommendations(event.target.value)} />
        </Field>
        <Field label="Follow-up date" htmlFor="report-followup">
          <Input id="report-followup" type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => submit.mutate()}
          loading={submit.isPending}
          disabled={title.trim().length < 3 || clinicalNotes.trim().length < 3 || assessment.trim().length < 3 || recommendations.trim().length < 3}
        >
          Save report
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

export { ShieldOff };
