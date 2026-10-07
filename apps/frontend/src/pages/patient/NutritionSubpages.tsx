import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, ClipboardList, Plus, UtensilsCrossed } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { NUTRITION_DISCLAIMER, NUTRITION_PHASES, SIDE_EFFECT_GUIDANCE } from "@breastcare/shared";
import type { NutritionPhase, NutritionPlan } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useNutrition, useNutritionAdherence } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { DataTable, DialogBody, DialogFooter, DialogHeader, DisclaimerCard, EmptyState, ErrorState, PageHeader, type Column } from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Slider, Textarea } from "@/components/ui/Input";
import { PlanDetail } from "./Nutrition";
import { formatDate, fromNow } from "@/lib/utils";

const PHASE_ROUTE: Record<string, string> = {
  "during-treatment": "during-treatment",
  recovery: "recovery",
  survivorship: "survivorship",
  "side-effect-support": "side-effects",
};

/** One page per nutrition category, driven by the shared knowledge base. */
export function NutritionPlanPage({ phase }: { phase?: NutritionPhase }) {
  const nutrition = useNutrition();
  const content = phase ? NUTRITION_PHASES.find((entry) => entry.phase === phase) : undefined;
  const plans = nutrition.data?.plans ?? [];
  const matching = phase ? plans.filter((plan) => plan.phase === phase) : plans;
  const latest = matching[0] ?? null;

  const title = content?.title ?? "Your nutrition plan";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={content?.summary ?? "Educational meal planning built from your treatment phase, side effects and preferences."}
      />

      <DisclaimerCard title="Nutrition guidance is educational" body={NUTRITION_DISCLAIMER} />

      {content ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHead title="Priorities for this phase" />
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {content.priorities.map((priority) => (
                  <li key={priority}>• {priority}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-warning/30">
            <CardHead title="Cautions" description="Please raise these with your clinical team rather than acting on them alone." />
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {content.cautions.map((caution) => (
                  <li key={caution}>• {caution}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {phase === "side-effect-support" ? (
        <Card>
          <CardHead title="Eating around side effects" description="Strategies that many people find helpful. Always tell your team what you are experiencing." />
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {SIDE_EFFECT_GUIDANCE.map((guidance) => (
                <div key={guidance.id} className="rounded-lg border p-4">
                  <p className="text-sm font-medium">{guidance.symptom}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{guidance.summary}</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {guidance.suggestions.map((suggestion) => (
                      <li key={suggestion}>• {suggestion}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-warning">{guidance.whenToContactCareTeam}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {nutrition.error ? <ErrorState message="We couldn't load your plans." onRetry={() => void nutrition.refetch()} /> : null}

      {latest ? <PlanDetail plan={latest} /> : null}

      <Card>
        <CardHead
          title={phase ? `Plans for ${title.toLowerCase()}` : "All your plans"}
          description="Newest first. Each plan carries a content hash so it can be verified later."
          action={
            <Button variant="outline" size="sm" asChild>
              <a href={`/app/nutrition/plan${phase ? `?phase=${PHASE_ROUTE[phase] ?? phase}` : ""}`}>
                <Plus className="size-4" /> New plan
              </a>
            </Button>
          }
        />
        <CardContent>
          <DataTable<NutritionPlan>
            rows={plans}
            isLoading={nutrition.isLoading}
            columns={planColumns}
            empty={
              <EmptyState
                title="No plans yet"
                description="Build a plan from the personalised plan builder."
                icon={<UtensilsCrossed className="size-5" />}
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

const planColumns: Column<NutritionPlan>[] = [
  { key: "title", header: "Plan", cell: (plan) => <span className="font-medium">{plan.title}</span> },
  { key: "phase", header: "Phase", cell: (plan) => plan.phase.replace(/-/g, " ") },
  { key: "meals", header: "Meals", cell: (plan) => String(plan.meals.length) },
  { key: "hydration", header: "Fluids", cell: (plan) => `${plan.hydrationTargetMl} ml` },
  {
    key: "reviewed",
    header: "Clinical review",
    cell: (plan) => (plan.reviewedByProfessional ? <Badge tone="success">Reviewed</Badge> : <Badge tone="warning">Pending</Badge>),
  },
  { key: "created", header: "Created", cell: (plan) => formatDate(plan.createdAt) },
];

/* ------------------------------------------------------------------ */
/* Meal logging                                                        */
/* ------------------------------------------------------------------ */

const SLOTS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "mid-morning", label: "Mid-morning" },
  { value: "lunch", label: "Lunch" },
  { value: "afternoon", label: "Afternoon" },
  { value: "dinner", label: "Dinner" },
  { value: "evening", label: "Evening" },
  { value: "snack", label: "Snack" },
] as const;

export function NutritionLogPage() {
  const queryClient = useQueryClient();
  const adherence = useNutritionAdherence(30);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meal Log"
        description="Record what you actually ate, how your appetite was, and whether nausea got in the way."
        actions={
          <Button onClick={() => setOpen(true)}>
            <ClipboardList className="size-4" /> Log a meal
          </Button>
        }
      />

      <DisclaimerCard title="Your log is for you and your care team" body="Logging meals helps you and your clinician spot patterns. It is not a diet programme and it is not a substitute for dietetic advice." />

      {adherence.error ? <ErrorState message="We couldn't load your log." onRetry={() => void adherence.refetch()} /> : null}

      <Card>
        <CardHead title="Recent entries" description="Newest first, last 30 days." />
        <CardContent>
          <DataTable
            rows={adherence.data?.entries ?? []}
            isLoading={adherence.isLoading}
            columns={logColumns}
            empty={<EmptyState title="Nothing logged yet" description="Log your next meal to start tracking patterns." icon={<UtensilsCrossed className="size-5" />} />}
          />
        </CardContent>
      </Card>

      <LogDialog
        open={open}
        onOpenChange={setOpen}
        onLogged={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.patient.nutrition });
          void queryClient.invalidateQueries({ queryKey: queryKeys.patient.adherence(30) });
        }}
      />
    </div>
  );
}

interface LogRow {
  id: string;
  loggedAt: string;
  slot: string;
  description: string;
  adherence: string;
  appetiteScore: number;
  nauseaScore: number;
}

const logColumns: Column<LogRow>[] = [
  { key: "when", header: "When", cell: (entry) => <span className="whitespace-nowrap text-muted-foreground">{fromNow(entry.loggedAt)}</span> },
  { key: "slot", header: "Slot", cell: (entry) => <Badge tone="muted">{SLOTS.find((slot) => slot.value === entry.slot)?.label ?? entry.slot}</Badge> },
  { key: "description", header: "What you ate", cell: (entry) => <span className="line-clamp-1">{entry.description}</span> },
  {
    key: "adherence",
    header: "Followed",
    cell: (entry) => (
      <Badge tone={entry.adherence === "followed" ? "success" : entry.adherence === "partial" ? "warning" : "muted"}>{entry.adherence}</Badge>
    ),
  },
  { key: "appetite", header: "Appetite", cell: (entry) => `${entry.appetiteScore}/5` },
  { key: "nausea", header: "Nausea", cell: (entry) => `${entry.nauseaScore}/5` },
];

function LogDialog({ open, onOpenChange, onLogged }: { open: boolean; onOpenChange: (open: boolean) => void; onLogged: () => void }) {
  const [slot, setSlot] = useState<(typeof SLOTS)[number]["value"]>("lunch");
  const [description, setDescription] = useState("");
  const [followed, setFollowed] = useState<"followed" | "partial" | "skipped">("followed");
  const [appetite, setAppetite] = useState(3);
  const [nausea, setNausea] = useState(1);
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post("/patients/nutrition/logs", {
        slot,
        description,
        adherence: followed,
        appetiteScore: appetite,
        nauseaScore: nausea,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast.success("Meal logged");
      setDescription("");
      setNotes("");
      onOpenChange(false);
      onLogged();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader title="Log a meal" description="Kept off-chain. Nothing you type here is written to the blockchain." onClose={() => onOpenChange(false)} />
      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meal" htmlFor="slot">
            <Select id="slot" value={slot} onChange={(event) => setSlot(event.target.value as typeof slot)}>
              {SLOTS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Did you follow your plan?" htmlFor="followed">
            <Select id="followed" value={followed} onChange={(event) => setFollowed(event.target.value as typeof followed)}>
              <option value="followed">Yes</option>
              <option value="partial">Partly</option>
              <option value="skipped">Skipped it</option>
            </Select>
          </Field>
        </div>

        <Field label="What did you eat?" htmlFor="description" required>
          <Textarea id="description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Porridge with berries, tea with milk…" />
        </Field>

        <Field label={`Appetite — ${appetite}/5`}>
          <Slider value={[appetite]} min={0} max={5} step={1} onValueChange={(value) => setAppetite(value[0] ?? 0)} />
        </Field>
        <Field label={`Nausea — ${nausea}/5`}>
          <Slider value={[nausea]} min={0} max={5} step={1} onValueChange={(value) => setNausea(value[0] ?? 0)} />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={description.trim().length < 2}>
          Save entry
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Adherence                                                           */
/* ------------------------------------------------------------------ */

export function NutritionAdherencePage() {
  const adherence = useNutritionAdherence(30);

  const chartData = [...(adherence.data?.entries ?? [])]
    .reverse()
    .map((entry) => ({
      day: entry.loggedAt.slice(0, 10),
      appetite: entry.appetiteScore,
      nausea: entry.nauseaScore,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition Adherence"
        description="A rolling 30-day view of how closely you followed your plan, and how appetite and nausea moved."
      />

      {adherence.error ? <ErrorState message="We couldn't load adherence data." onRetry={() => void adherence.refetch()} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Adherence rate</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{Math.round((adherence.data?.adherenceRate ?? 0) * 100)}%</p>
            <p className="text-xs text-muted-foreground">Partial entries count as half</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average appetite</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{(adherence.data?.averageAppetite ?? 0).toFixed(1)} / 5</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average nausea</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{(adherence.data?.averageNausea ?? 0).toFixed(1)} / 5</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHead title="Appetite and nausea over time" description="Self-reported alongside each logged meal." />
        <CardContent className="h-64">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <ChartTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="appetite" name="Appetite" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="nausea" name="Nausea" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No entries in the last 30 days" description="Log meals to see your trend here." icon={<BarChart3 className="size-5" />} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHead title="Entries" />
        <CardContent>
          <DataTable
            rows={adherence.data?.entries ?? []}
            isLoading={adherence.isLoading}
            columns={logColumns}
            empty={<EmptyState title="Nothing logged in this window" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}
