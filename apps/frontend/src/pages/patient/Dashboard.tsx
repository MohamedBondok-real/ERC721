import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  Link2,
  Pill,
  Salad,
  ShieldCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { RISK_ASSESSMENT_DISCLAIMER } from "@breastcare/shared";
import { useAuth } from "@/context/AuthContext";
import { usePatientOverview, useTimeline } from "@/lib/hooks";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { Callout, EmptyState, ErrorState, PageHeader, PageSkeleton, StatCard } from "@/components/ui/Feedback";
import { RISK_COPY, TREATMENT_COPY, APPOINTMENT_COPY, URGENCY_COPY } from "@/lib/format";
import { cn, formatDate, formatDateTime, fromNow, relativeDateLabel } from "@/lib/utils";

const TONE_CLASSES = {
  muted: "border-border bg-muted text-muted-foreground",
  accent: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

export function Dashboard() {
  const { patient, patientId } = useAuth();
  const overview = usePatientOverview();
  const timeline = useTimeline();

  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => api.get<{ notifications: { id: string; title: string; body: string; readAt: string | null }[]; unread: number }>("/notifications", undefined, signal),
  });

  if (overview.isLoading) return <PageSkeleton />;
  if (overview.error) return <ErrorState message="We couldn't load your dashboard." onRetry={() => void overview.refetch()} />;

  const data = overview.data!;
  const risk = data.latestAssessment ? RISK_COPY[data.latestAssessment.level] : null;
  const urgency = data.latestAssessment ? URGENCY_COPY[data.latestAssessment.urgency] : null;
  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${data.profile.displayName.split(" ")[0]}`}
        description="A summary of your care activity. Everything here is educational — clinical decisions stay with your care team."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/risk-assessment">
                <Activity className="size-4" /> New assessment
              </Link>
            </Button>
            <Button asChild>
              <Link to="/app/symptoms">Report a symptom</Link>
            </Button>
          </>
        }
      />

      {data.redFlagSymptoms > 0 ? (
        <Callout tone="danger" title="Symptoms flagged for prompt clinical review">
          <p>
            {data.redFlagSymptoms} of your reported {data.redFlagSymptoms === 1 ? "symptom matches" : "symptoms match"} a
            pattern that should be examined by a clinician soon. Open the symptom tracker to review which ones were flagged.
          </p>
          <div className="mt-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/appointments">Arrange an appointment</Link>
            </Button>
          </div>
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Latest risk indicator"
          value={risk ? risk.label.replace(" indicators", "") : "Not assessed"}
          hint={risk ? "Educational only" : "Take the questionnaire"}
          icon={<Activity className="size-4" />}
          tone={risk?.tone ?? "muted"}
        />
        <StatCard
          label="Active treatments"
          value={data.activeTreatments.length}
          hint={data.activeTreatments[0] ? TREATMENT_COPY[data.activeTreatments[0].status].label : "None active"}
          icon={<Pill className="size-4" />}
          tone={data.activeTreatments.length ? "success" : "muted"}
        />
        <StatCard
          label="Medications"
          value={data.activeMedications.length}
          hint={data.activeMedications.length ? "Schedule tracked" : "Nothing prescribed"}
          icon={<Pill className="size-4" />}
        />
        <StatCard
          label="Unread notifications"
          value={unread}
          hint={unread ? "Review when convenient" : "You're up to date"}
          icon={<ClipboardList className="size-4" />}
          tone={unread ? "warning" : "muted"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Care timeline"
            description="Your records, assessments, appointments and consent changes, newest first."
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/records">View records</Link>
              </Button>
            }
          />
          <CardContent>
            {timeline.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : timeline.data?.events.length ? (
              <ol className="relative space-y-4 border-l pl-5">
                {timeline.data.events.slice(0, 8).map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-background",
                        event.tone === "destructive" ? "bg-destructive" : event.tone === "warning" ? "bg-warning" : "bg-primary",
                      )}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <span className="text-xs text-muted-foreground" title={formatDateTime(event.occurredAt)}>
                        {fromNow(event.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{event.summary}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No activity yet" description="Complete a risk assessment or report a symptom to start your timeline." icon={<FileText className="size-5" />} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Risk indicator" description={RISK_ASSESSMENT_DISCLAIMER.split(".")[0] + "."} />
            <CardContent className="space-y-3">
              {risk ? (
                <>
                  <Badge tone={risk.tone}>{risk.label}</Badge>
                  <p className="text-sm text-muted-foreground">{risk.summary}</p>
                  {urgency ? (
                    <div className="rounded-md border p-3 text-xs">
                      <p className="font-medium">{urgency.label}</p>
                      <p className="mt-1 text-muted-foreground">{urgency.guidance}</p>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Assessed {data.latestAssessment ? formatDate(data.latestAssessment.completedAt) : "—"} · model{" "}
                    {data.latestAssessment?.modelName}
                  </p>
                </>
              ) : (
                <EmptyState title="No assessment yet" description="Answer the questionnaire to see your educational risk indicator." icon={<Activity className="size-5" />} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHead
              title="Next appointment"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/appointments">All</Link>
                </Button>
              }
            />
            <CardContent>
              {data.upcomingAppointments[0] ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{data.upcomingAppointments[0].reason}</p>
                  <p className="text-sm text-muted-foreground">{formatDateTime(data.upcomingAppointments[0].startsAt)}</p>
                  <Badge tone={APPOINTMENT_COPY[data.upcomingAppointments[0].status].tone}>
                    {APPOINTMENT_COPY[data.upcomingAppointments[0].status].label}
                  </Badge>
                </div>
              ) : (
                <EmptyState title="Nothing booked" description="Request an appointment with your care team." icon={<CalendarDays className="size-5" />} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHead title="Nutrition" description="Educational guidance for your current phase." />
          <CardContent className="space-y-3">
            {data.latestNutritionPlan ? (
              <>
                <p className="text-sm font-medium">{data.latestNutritionPlan.title}</p>
                <p className="text-sm text-muted-foreground">
                  {data.latestNutritionPlan.meals.length} meal suggestions · hydration {data.latestNutritionPlan.hydrationTargetMl} ml/day
                </p>
                <p className="text-xs text-muted-foreground">{data.latestNutritionPlan.disclaimer}</p>
              </>
            ) : (
              <EmptyState title="No plan yet" description="Build a plan for your treatment phase." icon={<Salad className="size-5" />} />
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/nutrition">Open nutrition</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHead title="Records & reports" />
          <CardContent className="space-y-2 text-sm">
            <Row icon={<FileText className="size-4" />} label="Medical records" value={String(data.counts.records)} to="/app/records" />
            <Row icon={<ClipboardList className="size-4" />} label="Reports from clinicians" value={String(data.counts.reports)} to="/app/reports" />
            <Row icon={<Activity className="size-4" />} label="Symptom reports" value={String(data.counts.symptoms)} to="/app/symptoms" />
            <Row icon={<ShieldCheck className="size-4" />} label="Risk assessments" value={String(data.counts.assessments)} to="/app/risk-assessment" />
          </CardContent>
        </Card>

        <Card>
          <CardHead title="Integrity & consent" />
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                {data.profile.onChainRegistered
                  ? "Your pseudonymous identity is registered on-chain. Content hashes are anchored so records can be verified."
                  : "Link a wallet in Settings to register your pseudonymous identity on-chain."}
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Only identifiers, hashes, consent and audit entries are stored on-chain — never clinical content.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/consent">Manage consent</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/blockchain">Blockchain</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHead title="Recorded activity by month" description="Counts of records created and assessments completed." />
        <CardContent className="h-56">
          <ActivityChart patientId={patientId} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ icon, label, value, to }: { icon: React.ReactNode; label: string; value: string; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </Link>
  );
}

function ActivityChart({ patientId }: { patientId: string | null }) {
  const timeline = useTimeline();
  void patientId;

  const buckets = new Map<string, { month: string; records: number }>();
  for (const event of timeline.data?.events ?? []) {
    const key = event.occurredAt.slice(0, 7);
    buckets.set(key, { month: key, records: (buckets.get(key)?.records ?? 0) + 1 });
  }
  const chartData = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-8);

  if (chartData.length === 0) {
    return <EmptyState title="No recorded activity yet" description="Activity appears here as records are created." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <ChartTooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(label) => `Month ${String(label)}`}
          formatter={(value: number | string) => [String(value), "Records"]}
        />
        <Area type="monotone" dataKey="records" name="Records" stroke="hsl(var(--primary))" fill="url(#activityFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
