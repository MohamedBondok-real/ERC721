import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { AuditLogEntry, BlockchainRecord, PlatformAnalytics } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { DataTable, Callout, EmptyState, ErrorState, PageHeader, StatCard, type Column } from "@/components/ui/Feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Overlay";
import { formatDateTime, fromNow, shortHash } from "@/lib/utils";

interface AdminOverviewResponse {
  counts: {
    users: number;
    patients: number;
    doctors: number;
    appointments: number;
    reports: number;
    consents: number;
    activeConsents: number;
    auditEntries: number;
    blockchainRecords: number;
    anchoredRecords: number;
  };
  users: {
    id: string;
    email: string;
    role: "patient" | "doctor" | "admin";
    displayName: string;
    status: "active" | "suspended";
    walletLinked: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  }[];
  doctors: { id: string; displayName: string; specialty: string; institution: string }[];
  recentAudit: AuditLogEntry[];
  recentBlockchain: BlockchainRecord[];
  analytics: PlatformAnalytics;
  riskModels: { id: string; version: string; label: string; description: string; active: boolean }[];
  demoMode: boolean;
  demoBanner: string;
  privacyNote: string;
}

const PIE_COLOURS = ["hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))"];

export function AdminOverview() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: queryKeys.admin.overview,
    queryFn: ({ signal }) => api.get<AdminOverviewResponse>("/admin/overview", undefined, signal),
  });

  const [suspending, setSuspending] = useState<AdminOverviewResponse["users"][number] | null>(null);

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "suspended" }) =>
      api.patch(`/admin/users/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("User status updated");
      setSuspending(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.overview });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (overview.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Administration" />
        <p className="text-sm text-muted-foreground">Loading platform overview…</p>
      </div>
    );
  }
  if (overview.error) return <ErrorState message="We couldn't load the admin overview." onRetry={() => void overview.refetch()} />;

  const data = overview.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Platform health, account management and analytics. All figures are aggregates — no clinical content is shown here."
        actions={
          <Button variant="outline" onClick={() => void overview.refetch()}>
            Refresh
          </Button>
        }
      />

      <Callout tone="warning" title="Administrators do not have clinical access">
        <p>{data.privacyNote}</p>
      </Callout>

      {data.demoMode ? (
        <Callout tone="info" title={data.demoBanner}>
          <p>This instance is running on the in-memory demo dataset. Restarting the API resets it.</p>
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={data.counts.users} hint={`${data.counts.patients} patients · ${data.counts.doctors} clinicians`} icon={<Users className="size-4" />} tone="accent" />
        <StatCard label="Active consents" value={data.counts.activeConsents} hint={`${data.counts.consents} total`} icon={<ShieldCheck className="size-4" />} tone="success" />
        <StatCard label="Audit entries" value={data.counts.auditEntries} hint="Every access decision" icon={<ClipboardList className="size-4" />} />
        <StatCard label="Anchored records" value={data.counts.anchoredRecords} hint={`${data.counts.blockchainRecords} total`} icon={<Boxes className="size-4" />} tone="success" />
      </div>

      <Tabs defaultValue="analytics">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="chain">Blockchain records</TabsTrigger>
          <TabsTrigger value="models">Risk models</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHead title="Risk indicator distribution" description="Educational indicators across all assessments." />
              <CardContent className="h-64">
                {data.analytics.riskDistribution.some((entry) => entry.count > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.analytics.riskDistribution} dataKey="count" nameKey="level" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {data.analytics.riskDistribution.map((entry, index) => (
                          <Cell key={entry.level} fill={PIE_COLOURS[index % PIE_COLOURS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <ChartTooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No assessments yet" icon={<BarChart3 className="size-5" />} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHead title="Most reported symptoms" description="Aggregate counts only." />
              <CardContent className="h-64">
                {data.analytics.symptomFrequency.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.analytics.symptomFrequency.slice(0, 8)} layout="vertical" margin={{ left: 20, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="symptom" width={140} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <ChartTooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Reports" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No symptom reports yet" icon={<Activity className="size-5" />} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHead title="Assessments completed by month" />
              <CardContent className="h-64">
                {data.analytics.patientTrend.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.analytics.patientTrend} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <ChartTooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="patients" name="Patients" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="assessments" name="Assessments" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No trend data yet" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHead title="Treatment status" description="Across all consenting patients." />
              <CardContent className="h-64">
                {data.analytics.treatmentStatus.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.analytics.treatmentStatus} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="status" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <ChartTooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Plans" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No treatment plans yet" icon={<Stethoscope className="size-5" />} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHead title="Accounts" description="Suspending an account blocks login immediately. Existing consent grants are unaffected." />
            <CardContent>
              <DataTable
                rows={data.users}
                columns={[
                  { key: "name", header: "Name", cell: (row) => <span className="font-medium">{row.displayName}</span> },
                  { key: "email", header: "Email", cell: (row) => <span className="text-muted-foreground">{row.email}</span> },
                  { key: "role", header: "Role", cell: (row) => <Badge tone={row.role === "admin" ? "accent" : "muted"}>{row.role}</Badge> },
                  {
                    key: "wallet",
                    header: "Wallet",
                    cell: (row) => (row.walletLinked ? <Badge tone="success">Linked</Badge> : <span className="text-xs text-muted-foreground">—</span>),
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (row) => <Badge tone={row.status === "active" ? "success" : "destructive"}>{row.status}</Badge>,
                  },
                  {
                    key: "last",
                    header: "Last login",
                    cell: (row) => <span className="text-xs text-muted-foreground">{row.lastLoginAt ? fromNow(row.lastLoginAt) : "Never"}</span>,
                  },
                  {
                    key: "action",
                    header: "",
                    className: "text-right",
                    cell: (row) => (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSuspending(row)}
                        disabled={row.role === "admin"}
                      >
                        {row.status === "active" ? "Suspend" : "Reactivate"}
                      </Button>
                    ),
                  },
                ]}
                empty={<EmptyState title="No users" />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHead
              title="Recent audit entries"
              description="Includes denials. A denied read is recorded exactly like a successful one."
              action={<Badge tone="muted">{data.counts.auditEntries} total</Badge>}
            />
            <CardContent>
              <DataTable<AuditLogEntry>
                rows={data.recentAudit}
                columns={auditColumns}
                empty={<EmptyState title="No audit entries yet" />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chain">
          <Card>
            <CardHead title="Blockchain records" description="Hashes submitted to the contracts, with their transaction and block." />
            <CardContent>
              <DataTable<BlockchainRecord>
                rows={data.recentBlockchain}
                columns={chainColumns}
                empty={<EmptyState title="Nothing anchored yet" icon={<Boxes className="size-5" />} />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models">
          <Card>
            <CardHead
              title="Risk assessment models"
              description="The engine is pluggable: a validated clinical model can be registered without changing any caller."
            />
            <CardContent className="space-y-3">
              {data.riskModels.map((model) => (
                <div key={model.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{model.label}</p>
                    <Badge tone="muted">
                      {model.id} v{model.version}
                    </Badge>
                    {model.active ? <Badge tone="success">Active</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{model.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {suspending ? (
        <SuspendDialog
          user={suspending}
          onClose={() => setSuspending(null)}
          onConfirm={(status) => setStatus.mutate({ id: suspending.id, status })}
          pending={setStatus.isPending}
        />
      ) : null}
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

const auditColumns: Column<AuditLogEntry>[] = [
  { key: "action", header: "Action", cell: (entry) => <span className="font-medium">{entry.action}</span> },
  { key: "actor", header: "Actor", cell: (entry) => <span className="text-xs text-muted-foreground">{entry.actorRole}</span> },
  { key: "resource", header: "Resource", cell: (entry) => <span className="text-muted-foreground">{entry.resource}</span> },
  {
    key: "outcome",
    header: "Outcome",
    cell: (entry) => (
      <Badge tone={entry.outcome === "success" ? "success" : entry.outcome === "denied" ? "warning" : "destructive"}>
        {entry.outcome}
      </Badge>
    ),
  },
  {
    key: "chain",
    header: "On-chain",
    cell: (entry) => (entry.onChainEntryId ? <span className="font-mono text-xs text-muted-foreground">#{entry.onChainEntryId}</span> : <span className="text-xs text-muted-foreground">—</span>),
  },
  { key: "when", header: "When", cell: (entry) => <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDateTime(entry.createdAt)}>{fromNow(entry.createdAt)}</span> },
];

const chainColumns: Column<BlockchainRecord>[] = [
  { key: "label", header: "Record", cell: (record) => <span className="font-medium">{record.label}</span> },
  { key: "contract", header: "Contract", cell: (record) => <span className="text-muted-foreground">{record.contract}</span> },
  { key: "hash", header: "Hash", cell: (record) => <code className="font-mono text-xs">{shortHash(record.dataHash)}</code> },
  { key: "tx", header: "Transaction", cell: (record) => <code className="font-mono text-xs">{record.transactionHash ? shortHash(record.transactionHash) : "—"}</code> },
  { key: "block", header: "Block", cell: (record) => <span className="tabular-nums text-muted-foreground">{record.blockNumber ?? "—"}</span> },
  {
    key: "status",
    header: "Status",
    cell: (record) => (
      <Badge tone={record.status === "confirmed" ? "success" : record.status === "failed" ? "destructive" : "muted"}>{record.status}</Badge>
    ),
  },
  {
    key: "verification",
    header: "Verified",
    cell: (record) => (
      <Badge tone={record.verification === "match" ? "success" : record.verification === "mismatch" ? "destructive" : "muted"}>
        {record.verification}
      </Badge>
    ),
  },
];

function SuspendDialog({
  user,
  onClose,
  onConfirm,
  pending,
}: {
  user: { displayName: string; email: string; status: "active" | "suspended" };
  onClose: () => void;
  onConfirm: (status: "active" | "suspended") => void;
  pending: boolean;
}) {
  const next = user.status === "active" ? "suspended" : "active";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-[min(96vw,440px)] rounded-lg border bg-card p-5 shadow-xl">
        <p className="flex items-center gap-2 text-base font-semibold">
          <ShieldAlert className="size-4 text-warning" /> {next === "suspended" ? "Suspend" : "Reactivate"} this account?
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {user.displayName} ({user.email}) will be {next === "suspended" ? "blocked from signing in" : "able to sign in again"}.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={next === "suspended" ? "destructive" : "default"} onClick={() => onConfirm(next)} loading={pending}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

export { errorMessage };
