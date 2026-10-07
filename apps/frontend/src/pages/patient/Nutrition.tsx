import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Apple, Droplets, Info, ListChecks, Plus, Salad, Utensils } from "lucide-react";
import { NUTRITION_DISCLAIMER, NUTRITION_PHASES, SIDE_EFFECT_GUIDANCE } from "@breastcare/shared";
import type { MealSuggestion, NutritionPlan } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useNutrition } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Overlay";
import { Callout, DisclaimerCard, EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/ui/Feedback";
import { formatDate } from "@/lib/utils";

const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  "mid-morning": "Mid-morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
};

export function NutritionPage() {
  const nutrition = useNutrition();

  if (nutrition.isLoading) return <PageSkeleton />;
  if (nutrition.error) return <ErrorState message="We couldn't load your nutrition plans." onRetry={() => void nutrition.refetch()} />;

  const { plans, adherence } = nutrition.data!;
  const latest = plans[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition"
        description="Educational food guidance for each phase of care, plus a personalised plan builder and an adherence log."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/nutrition/log">Log a meal</Link>
            </Button>
            <Button asChild>
              <Link to="/app/nutrition/plan">
                <Plus className="size-4" /> Build a plan
              </Link>
            </Button>
          </>
        }
      />

      <DisclaimerCard title="Nutrition guidance is educational" body={NUTRITION_DISCLAIMER} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Adherence (30 days)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{Math.round(adherence.adherenceRate * 100)}%</p>
            <p className="text-xs text-muted-foreground">{adherence.entries.length} logged meals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average appetite</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{adherence.averageAppetite.toFixed(1)} / 5</p>
            <p className="text-xs text-muted-foreground">From your meal logs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average nausea</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{adherence.averageNausea.toFixed(1)} / 5</p>
            <p className="text-xs text-muted-foreground">Reported alongside meals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Hydration target</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{latest?.hydrationTargetMl ?? 2200} ml</p>
            <p className="text-xs text-muted-foreground">General daily guide</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NUTRITION_PHASES.map((phase) => (
          <Card key={phase.phase} className="flex flex-col">
            <CardHead title={phase.title} />
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="line-clamp-4 text-sm text-muted-foreground">{phase.summary}</p>
              <Button variant="outline" size="sm" className="mt-auto" asChild>
                <Link to={`/app/nutrition/${phase.phase === "side-effect-support" ? "side-effects" : phase.phase}`}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {latest ? <PlanDetail plan={latest} /> : <NoPlanYet />}

      <Card>
        <CardHead title="Side-effect support" description="Practical eating strategies for common treatment side effects. Not a substitute for clinical advice." />
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {SIDE_EFFECT_GUIDANCE.map((guidance) => (
              <div key={guidance.id} className="rounded-lg border p-4">
                <p className="text-sm font-medium">{guidance.symptom}</p>
                <p className="mt-1 text-sm text-muted-foreground">{guidance.summary}</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {guidance.suggestions.slice(0, 3).map((suggestion) => (
                    <li key={suggestion}>• {suggestion}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-warning">{guidance.whenToContactCareTeam}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PlanDetail({ plan }: { plan: NutritionPlan }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHead
          title={plan.title}
          description={`Created ${formatDate(plan.createdAt)} · phase ${plan.phase.replace(/-/g, " ")}`}
          action={
            plan.reviewedByProfessional ? (
              <Badge tone="success">Reviewed by a professional</Badge>
            ) : (
              <Badge tone="warning">Not yet reviewed clinically</Badge>
            )
          }
        />
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {plan.calorieTargetKcal ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Utensils className="size-4" /> ~{plan.calorieTargetKcal} kcal/day
              </span>
            ) : null}
            {plan.proteinTargetGrams ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Apple className="size-4" /> {plan.proteinTargetGrams} g protein/day
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Droplets className="size-4" /> {plan.hydrationTargetMl} ml fluid/day
            </span>
          </div>

          {plan.goals.length ? (
            <div>
              <p className="mb-1.5 text-sm font-medium">Goals</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {plan.goals.map((goal) => (
                  <li key={goal} className="flex gap-2">
                    <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{goal}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="meals">
        <TabsList>
          <TabsTrigger value="meals">Meal ideas ({plan.meals.length})</TabsTrigger>
          <TabsTrigger value="foods">Foods</TabsTrigger>
          <TabsTrigger value="side-effects">Side-effect support ({plan.sideEffectSupport.length})</TabsTrigger>
          <TabsTrigger value="cautions">Cautions</TabsTrigger>
        </TabsList>

        <TabsContent value="meals">
          <Card>
            <CardContent className="pt-6">
              {plan.meals.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {plan.meals.map((meal) => (
                    <MealCard key={meal.id} meal={meal} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No meal suggestions in this plan" icon={<Salad className="size-5" />} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="foods">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {plan.foodsToEmphasize.length ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-success">Worth including</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.foodsToEmphasize.map((food) => (
                      <Badge key={food} tone="success">
                        {food}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {plan.foodsToDiscussWithClinician.length ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-warning">Ask your team about these</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.foodsToDiscussWithClinician.map((food) => (
                      <Badge key={food} tone="warning">
                        {food}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {plan.foodsThatMayWorsenSymptoms.length ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium">May worsen symptoms</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {plan.foodsThatMayWorsenSymptoms.map((entry) => (
                      <li key={`${entry.food}-${entry.reason}`}>
                        <span className="font-medium text-foreground">{entry.food}</span> — {entry.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="side-effects">
          <Card>
            <CardContent className="pt-6">
              {plan.sideEffectSupport.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {plan.sideEffectSupport.map((guidance) => (
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
              ) : (
                <EmptyState title="No side-effect guidance was needed for this plan" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cautions">
          <Card>
            <CardContent className="space-y-3 pt-6">
              {plan.cautions.length ? (
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {plan.cautions.map((caution) => (
                    <li key={caution} className="flex gap-2">
                      <Info className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>{caution}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No specific cautions were generated for this plan.</p>
              )}
              <Callout tone="info" title="Not a prescription">
                <p>{plan.disclaimer}</p>
              </Callout>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function MealCard({ meal }: { meal: MealSuggestion }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{meal.name}</p>
        <Badge tone="muted">{SLOT_LABEL[meal.slot] ?? meal.slot}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{meal.description}</p>
      <p className="mt-2 text-xs text-muted-foreground">{meal.rationale}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">~{meal.approximateKcal} kcal</span>
        <span className="tabular-nums">{meal.proteinGrams} g protein</span>
        {meal.tags.map((tag) => (
          <Badge key={tag} tone="muted">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function NoPlanYet() {
  const queryClient = useQueryClient();
  const [building, setBuilding] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.post<NutritionPlan>("/patients/nutrition/plans", {
        phase: "during-treatment",
        treatmentModalities: [],
        sideEffects: [],
        dietaryPreferences: [],
        allergies: [],
        restrictions: [],
        comorbidities: [],
        clinicianRecommendations: "",
        appetiteScore: 3,
        weightTrend: "unknown",
      }),
    onSuccess: () => {
      toast.success("Plan created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient.nutrition });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <EmptyState
          title="You don't have a plan yet"
          description="Answer a few questions about your treatment phase, side effects and preferences to generate an educational plan."
          icon={<Salad className="size-5" />}
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/app/nutrition/plan">Build a personalised plan</Link>
              </Button>
              <Button variant="outline" onClick={() => { setBuilding(true); create.mutate(); }} loading={create.isPending && building}>
                Quick start plan
              </Button>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
