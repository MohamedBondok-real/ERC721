import { Pool, type PoolClient } from "pg";
import { COLLECTION_NAMES, TABLE_FOR, type Collection, type CollectionName, type Entity, type FindOptions, type Predicate, type Store } from "./types";

/* ------------------------------------------------------------------ */
/* PostgreSQL driver                                                   */
/*                                                                     */
/* Real relational persistence. Each collection maps to a table in     */
/* `schema.sql`; scalar fields become real columns and structured      */
/* fields (symptom lists, meal suggestions, factors…) become JSONB.    */
/*                                                                     */
/* The driver deliberately implements the same `Store` interface as    */
/* the in-memory store, so switching is a single environment variable.  */
/* ------------------------------------------------------------------ */

type ColumnKind = "text" | "jsonb" | "boolean" | "integer" | "numeric" | "timestamptz";

interface ColumnMap {
  /** Primary key column (always the entity id). */
  id: "text";
  columns: Record<string, ColumnKind>;
}

/**
 * Column definitions per table. Keys are the domain-object property names; the DDL in
 * `schema.sql` must declare exactly these columns.
 */
export const COLUMN_MAPS: Record<CollectionName, ColumnMap> = {
  users: {
    id: "text",
    columns: {
      email: "text",
      role: "text",
      displayName: "text",
      walletAddress: "text",
      pseudonymousId: "text",
      passwordHash: "text",
      status: "text",
      lastLoginAt: "timestamptz",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  patients: {
    id: "text",
    columns: {
      userId: "text",
      pseudonymousId: "text",
      displayName: "text",
      birthYear: "integer",
      age: "integer",
      biologicalSex: "text",
      region: "text",
      primaryDoctorId: "text",
      walletAddress: "text",
      onChainRegistered: "boolean",
      onChainPatientId: "text",
      bloodType: "text",
      allergies: "jsonb",
      comorbidities: "jsonb",
      currentTreatmentPhase: "text",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  doctors: {
    id: "text",
    columns: {
      userId: "text",
      displayName: "text",
      specialty: "text",
      licenseNumber: "text",
      institution: "text",
      email: "text",
      walletAddress: "text",
      acceptedPatients: "integer",
      createdAt: "timestamptz",
    },
  },
  records: {
    id: "text",
    columns: {
      patientId: "text",
      kind: "text",
      title: "text",
      summary: "text",
      body: "text",
      attachments: "jsonb",
      recordedById: "text",
      contentHash: "text",
      onChainRecordId: "text",
      verifiedAt: "timestamptz",
      lastVerification: "jsonb",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  symptoms: {
    id: "text",
    columns: {
      patientId: "text",
      code: "text",
      label: "text",
      severity: "text",
      side: "text",
      durationWeeks: "integer",
      progressive: "boolean",
      notes: "text",
      reportedAt: "timestamptz",
      guidance: "text",
      redFlag: "boolean",
      reviewedByDoctorId: "text",
      reviewedAt: "timestamptz",
      createdAt: "timestamptz",
    },
  },
  riskAssessments: {
    id: "text",
    columns: {
      patientId: "text",
      modelId: "text",
      modelVersion: "text",
      level: "text",
      score: "integer",
      maxScore: "integer",
      normalizedScore: "numeric",
      urgency: "text",
      input: "jsonb",
      factors: "jsonb",
      guidance: "jsonb",
      redFlags: "jsonb",
      disclaimer: "text",
      contentHash: "text",
      onChainRecordId: "text",
      completedAt: "timestamptz",
      reviewedByDoctorId: "text",
      doctorNote: "text",
      createdAt: "timestamptz",
    },
  },
  nutritionPlans: {
    id: "text",
    columns: {
      patientId: "text",
      phase: "text",
      title: "text",
      createdBy: "text",
      reviewedByProfessional: "boolean",
      calorieTargetKcal: "integer",
      proteinTargetGrams: "integer",
      hydrationTargetMl: "integer",
      goals: "jsonb",
      meals: "jsonb",
      foodsToEmphasize: "jsonb",
      foodsToDiscussWithClinician: "jsonb",
      foodsThatMayWorsenSymptoms: "jsonb",
      sideEffectSupport: "jsonb",
      cautions: "jsonb",
      disclaimer: "text",
      contentHash: "text",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  nutritionLogs: {
    id: "text",
    columns: {
      patientId: "text",
      loggedAt: "timestamptz",
      slot: "text",
      description: "text",
      adherence: "text",
      appetiteScore: "integer",
      nauseaScore: "integer",
      notes: "text",
      createdAt: "timestamptz",
    },
  },
  treatments: {
    id: "text",
    columns: {
      patientId: "text",
      name: "text",
      modality: "text",
      status: "text",
      startDate: "timestamptz",
      expectedEndDate: "timestamptz",
      treatingDoctorId: "text",
      summary: "text",
      notes: "text",
      sideEffects: "jsonb",
      progressPercent: "integer",
      documents: "jsonb",
      appointments: "jsonb",
      contentHash: "text",
      onChainPlanId: "text",
      authorizedByDoctorId: "text",
      authorizedAt: "timestamptz",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  medications: {
    id: "text",
    columns: {
      patientId: "text",
      name: "text",
      activeIngredient: "text",
      dosage: "text",
      route: "text",
      frequency: "text",
      scheduledTimes: "jsonb",
      startDate: "timestamptz",
      endDate: "timestamptz",
      status: "text",
      prescriberId: "text",
      instructions: "text",
      cautions: "text",
      reminderEnabled: "boolean",
      doses: "jsonb",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  appointments: {
    id: "text",
    columns: {
      patientId: "text",
      doctorId: "text",
      startsAt: "timestamptz",
      endsAt: "timestamptz",
      reason: "text",
      modality: "text",
      status: "text",
      location: "text",
      notes: "text",
      reminderSent: "boolean",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  reports: {
    id: "text",
    columns: {
      patientId: "text",
      doctorId: "text",
      title: "text",
      date: "timestamptz",
      clinicalNotes: "text",
      assessment: "text",
      treatmentInformation: "text",
      recommendations: "text",
      followUpDate: "timestamptz",
      contentHash: "text",
      onChainRecordId: "text",
      lastVerification: "jsonb",
      createdAt: "timestamptz",
      updatedAt: "timestamptz",
    },
  },
  consents: {
    id: "text",
    columns: {
      patientId: "text",
      granteeId: "text",
      granteeType: "text",
      granteeName: "text",
      scopeName: "text",
      scopeDescription: "text",
      scopeHash: "text",
      status: "text",
      grantedAt: "timestamptz",
      expiresAt: "timestamptz",
      revokedAt: "timestamptz",
      signature: "text",
      transactionHash: "text",
      createdAt: "timestamptz",
    },
  },
  notifications: {
    id: "text",
    columns: {
      userId: "text",
      kind: "text",
      title: "text",
      body: "text",
      readAt: "timestamptz",
      actionLabel: "text",
      actionHref: "text",
      severity: "text",
      createdAt: "timestamptz",
    },
  },
  auditLogs: {
    id: "text",
    columns: {
      actorId: "text",
      actorRole: "text",
      action: "text",
      patientId: "text",
      resource: "text",
      resourceId: "text",
      dataHash: "text",
      ipAddress: "text",
      outcome: "text",
      onChainEntryId: "text",
      createdAt: "timestamptz",
    },
  },
  blockchainRecords: {
    id: "text",
    columns: {
      patientId: "text",
      kind: "text",
      label: "text",
      dataHash: "text",
      contract: "text",
      transactionHash: "text",
      blockNumber: "integer",
      status: "text",
      verification: "text",
      confirmedAt: "timestamptz",
      createdAt: "timestamptz",
    },
  },
};

const NULLISH = new Set([null, undefined, ""]);

function toSqlValue(value: unknown, kind: ColumnKind): unknown {
  if (NULLISH.has(value as null | undefined | "")) return null;
  if (kind === "jsonb") return JSON.stringify(value ?? null);
  if (kind === "boolean") return Boolean(value);
  if (kind === "integer") return Number(value);
  if (kind === "numeric") return Number(value);
  if (kind === "timestamptz") return new Date(value as string).toISOString();
  return String(value);
}

function fromSqlValue(value: unknown, kind: ColumnKind): unknown {
  if (value === null || value === undefined) return kind === "jsonb" ? null : null;
  if (kind === "jsonb") return typeof value === "string" ? JSON.parse(value) : value;
  if (kind === "boolean") return Boolean(value);
  if (kind === "integer") return Number(value);
  if (kind === "numeric") return Number(value);
  if (kind === "timestamptz") return value instanceof Date ? value.toISOString() : String(value);
  return value;
}

class PostgresCollection<T extends Entity> implements Collection<T> {
  constructor(
    private readonly pool: Pool,
    private readonly name: CollectionName,
  ) {}

  private get table(): string {
    return TABLE_FOR[this.name];
  }

  private get map(): ColumnMap {
    return COLUMN_MAPS[this.name];
  }

  private rowToObject(row: Record<string, unknown>): T {
    const out: Record<string, unknown> = { id: row.id };
    for (const [column, kind] of Object.entries(this.map.columns)) {
      out[column] = fromSqlValue(row[column], kind);
    }
    return out as T;
  }

  private objectToRow(item: T): Record<string, unknown> {
    const source = item as unknown as Record<string, unknown>;
    const row: Record<string, unknown> = { id: item.id };
    for (const [column, kind] of Object.entries(this.map.columns)) {
      row[column] = toSqlValue(source[column], kind);
    }
    return row;
  }

  private buildWhere(where?: Partial<Record<keyof T, unknown>> | Predicate<T>): { clause: string; params: unknown[] } {
    if (!where) return { clause: "", params: [] };
    if (typeof where === "function") {
      throw new Error(
        `Predicate filters are not supported by the PostgreSQL driver on "${this.name}". Use an equality filter object.`,
      );
    }
    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;
      const kind = this.map.columns[key];
      if (!kind) continue;
      params.push(toSqlValue(value, kind));
      clauses.push(`"${key}" ${value === null ? "IS NULL" : `= $${params.length}`}`);
    }
    return { clause: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
  }

  async list(options: FindOptions<T> = {}): Promise<T[]> {
    if (typeof options.where === "function") throw new Error(`Predicate filters are not supported on "${this.name}"`);
    const { clause, params } = this.buildWhere(options.where);
    const orderColumn = typeof options.orderBy === "string" && this.map.columns[options.orderBy] ? options.orderBy : "createdAt";
    const direction = options.order === "asc" ? "ASC" : "DESC";
    let sql = `SELECT * FROM ${this.table}${clause} ORDER BY "${orderColumn}" ${direction}`;
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (options.offset) {
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }
    const result = await this.pool.query(sql, params);
    return result.rows.map((row) => this.rowToObject(row as Record<string, unknown>));
  }

  async get(id: string): Promise<T | undefined> {
    const result = await this.pool.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? this.rowToObject(row as Record<string, unknown>) : undefined;
  }

  async findFirst(where: Partial<Record<keyof T, unknown>> | Predicate<T>): Promise<T | undefined> {
    const rows = await this.list({ where, limit: 1 });
    return rows[0];
  }

  async insert(item: T): Promise<T> {
    const row = this.objectToRow(item);
    const columns = Object.keys(row);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const sql = `INSERT INTO ${this.table} (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
    const result = await this.pool.query(sql, columns.map((column) => row[column]));
    return this.rowToObject(result.rows[0] as Record<string, unknown>);
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const merged = { ...(await this.get(id)), ...patch, id, updatedAt: new Date().toISOString() } as unknown as T;
    const row = this.objectToRow(merged);
    const columns = Object.keys(row).filter((column) => column !== "id");
    const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`);
    const sql = `UPDATE ${this.table} SET ${assignments.join(", ")} WHERE id = $${columns.length + 1} RETURNING *`;
    const result = await this.pool.query(sql, [...columns.map((column) => row[column]), id]);
    if (result.rows.length === 0) throw new Error(`Cannot update missing record ${id}`);
    return this.rowToObject(result.rows[0] as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(options: FindOptions<T> = {}): Promise<number> {
    const { clause, params } = this.buildWhere(options.where);
    const result = await this.pool.query(`SELECT COUNT(*)::int AS count FROM ${this.table}${clause}`, params);
    return Number(result.rows[0]?.count ?? 0);
  }
}

export class PostgresStore implements Store {
  private readonly pool: Pool;
  readonly users!: Store["users"];
  readonly patients!: Store["patients"];
  readonly doctors!: Store["doctors"];
  readonly records!: Store["records"];
  readonly symptoms!: Store["symptoms"];
  readonly riskAssessments!: Store["riskAssessments"];
  readonly nutritionPlans!: Store["nutritionPlans"];
  readonly nutritionLogs!: Store["nutritionLogs"];
  readonly treatments!: Store["treatments"];
  readonly medications!: Store["medications"];
  readonly appointments!: Store["appointments"];
  readonly reports!: Store["reports"];
  readonly consents!: Store["consents"];
  readonly notifications!: Store["notifications"];
  readonly auditLogs!: Store["auditLogs"];
  readonly blockchainRecords!: Store["blockchainRecords"];

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });
    for (const name of COLLECTION_NAMES) {
      (this as unknown as Record<string, unknown>)[name] = new PostgresCollection<Entity>(this.pool, name);
    }
  }

  async ping(): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresStore(connectionString: string): PostgresStore {
  return new PostgresStore(connectionString);
}
