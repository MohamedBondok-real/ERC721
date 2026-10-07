import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { RISK_ASSESSMENT_DISCLAIMER } from "@breastcare/shared";
import type { RiskAssessmentInput, RiskAssessmentRecord } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useRiskAssessments, useRiskModels } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Overlay";
import { Callout, DataTable, EmptyState, ErrorState, PageHeader, type Column } from "@/components/ui/Feedback";
import { Checkbox, Field, FieldError, Input, Label, RadioGroup, RadioItem, Select } from "@/components/ui/Input";
import { RISK_COPY, URGENCY_COPY } from "@/lib/format";
import { formatDate, shortHash } from "@/lib/utils";

const EMPTY_INPUT: RiskAssessmentInput = {
  age: 45,
  biologicalSex: "female",
  familyHistory: {
    firstDegreeRelativesWithBreastCancer: 0,
    maleRelativeWithBreastCancer: false,
    relativeDiagnosedBefore50: false,
    ovarianOrPancreaticCancerInFamily: false,
    knownPathogenicVariant: false,
    ashkenaziJewishAncestry: false,
  },
  personalHistory: {
    previousBreastCancer: false,
    previousBenignBreastDisease: false,
    atypicalHyperplasiaOrLcis: false,
    chestRadiationBeforeAge30: false,
    otherCancerHistory: false,
  },
  reproductiveHistory: {
    menarcheBefore12: false,
    menopauseAfter55: false,
    firstLiveBirthAfter30: false,
    neverGaveBirth: false,
    neverBreastfed: false,
    combinedHormoneTherapy: false,
    currentHormoneTherapy: false,
  },
  lifestyle: { bmi: 24, alcoholUnitsPerWeek: 0, physicalActivity: "moderate", smokingStatus: "never", postmenopausal: false },
  screening: { lastMammogramMonthsAgo: 12, denseBreastTissue: false, screeningUpToDate: true },
  symptoms: [],
};

const SYMPTOM_OPTIONS = [
  { code: "breast-lump", label: "New lump or thickening" },
  { code: "nipple-discharge", label: "Nipple discharge" },
  { code: "skin-dimpling", label: "Skin dimpling" },
  { code: "nipple-inversion", label: "Nipple inversion or retraction" },
  { code: "breast-pain", label: "Persistent breast pain" },
  { code: "axillary-lump", label: "Armpit lump" },
  { code: "breast-swelling", label: "Swelling or change in size" },
  { code: "skin-rash", label: "Rash or redness on the breast" },
];

type StepKey = "age" | "family" | "personal" | "reproductive" | "lifestyle" | "screening" | "symptoms";

const STEPS: { key: StepKey; title: string; description: string }[] = [
  { key: "age", title: "About you", description: "Age drives much of the population risk; the model uses it as a baseline." },
  { key: "family", title: "Family history", description: "Relatives with breast, ovarian or pancreatic cancer, and any known gene variant." },
  { key: "personal", title: "Personal history", description: "Previous breast conditions, biopsies or chest radiotherapy." },
  { key: "reproductive", title: "Hormonal & reproductive history", description: "Factors that change lifetime hormone exposure." },
  { key: "lifestyle", title: "Lifestyle", description: "Weight, alcohol, activity and smoking — all modifiable." },
  { key: "screening", title: "Screening", description: "When you were last screened and what you were told." },
  { key: "symptoms", title: "Current symptoms", description: "Optional. Selecting a red-flag symptom raises the urgency of the advice, not a diagnosis." },
];

export function RiskAssessmentPage() {
  const queryClient = useQueryClient();
  const assessments = useRiskAssessments();
  const models = useRiskModels();
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<RiskAssessmentInput>(EMPTY_INPUT);
  const [result, setResult] = useState<RiskAssessmentRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const activeModel = models.data?.models.find((model) => model.active);

  const submit = useMutation({
    mutationFn: (values: RiskAssessmentInput) => api.post<RiskAssessmentRecord>("/patients/risk-assessment", values),
    onSuccess: (assessment) => {
      setResult(assessment);
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient.risk });
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient.overview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient.timeline });
    },
    onError: (error) => {
      setFormError(errorMessage(error));
      toast.error(errorMessage(error));
    },
  });

  const current = STEPS[step]!;

  function update<K extends keyof RiskAssessmentInput>(key: K, value: RiskAssessmentInput[K]) {
    setInput((previous) => ({ ...previous, [key]: value }));
  }

  function updateGroup<K extends "familyHistory" | "personalHistory" | "reproductiveHistory" | "lifestyle" | "screening">(
    group: K,
    key: keyof RiskAssessmentInput[K],
    value: RiskAssessmentInput[K][keyof RiskAssessmentInput[K]],
  ) {
    setInput((previous) => ({ ...previous, [group]: { ...previous[group], [key]: value } }));
  }

  if (result) return <ResultView assessment={result} onRestart={() => { setResult(null); setStep(0); setInput(EMPTY_INPUT); }} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Assessment"
        description="An educational questionnaire. It produces a Low, Moderate or High indicator — never a diagnosis."
        breadcrumb={activeModel ? `${activeModel.label} · v${activeModel.version}` : undefined}
      />

      <Callout tone="info" title="What this is, and what it is not">
        <p>{RISK_ASSESSMENT_DISCLAIMER}</p>
      </Callout>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHead
            title={`${step + 1}. ${current.title}`}
            description={current.description}
            action={<span className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</span>}
          />
          <CardContent className="space-y-5">
            <Progress value={((step + 1) / STEPS.length) * 100} />

            {current.key === "age" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Age" htmlFor="age" hint="This questionnaire is for adults aged 16 and over." required>
                  <Input
                    id="age"
                    type="number"
                    min={16}
                    max={120}
                    value={input.age}
                    onChange={(event) => update("age", Number(event.target.value))}
                  />
                </Field>
                <Field label="Biological sex" htmlFor="sex">
                  <Select
                    id="sex"
                    value={input.biologicalSex}
                    onChange={(event) => update("biologicalSex", event.target.value as RiskAssessmentInput["biologicalSex"])}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </Select>
                </Field>
              </div>
            ) : null}

            {current.key === "family" ? (
              <div className="space-y-4">
                <Field label="First-degree relatives with breast cancer" htmlFor="fdr" hint="Mother, sister, daughter, father, son or brother.">
                  <Input
                    id="fdr"
                    type="number"
                    min={0}
                    max={10}
                    value={input.familyHistory.firstDegreeRelativesWithBreastCancer}
                    onChange={(event) => updateGroup("familyHistory", "firstDegreeRelativesWithBreastCancer", Number(event.target.value))}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <BoolField label="A male relative with breast cancer" checked={input.familyHistory.maleRelativeWithBreastCancer} onChange={(value) => updateGroup("familyHistory", "maleRelativeWithBreastCancer", value)} />
                  <BoolField label="A relative diagnosed before age 50" checked={input.familyHistory.relativeDiagnosedBefore50} onChange={(value) => updateGroup("familyHistory", "relativeDiagnosedBefore50", value)} />
                  <BoolField label="Ovarian or pancreatic cancer in the family" checked={input.familyHistory.ovarianOrPancreaticCancerInFamily} onChange={(value) => updateGroup("familyHistory", "ovarianOrPancreaticCancerInFamily", value)} />
                  <BoolField label="Known BRCA or other pathogenic variant" checked={input.familyHistory.knownPathogenicVariant} onChange={(value) => updateGroup("familyHistory", "knownPathogenicVariant", value)} />
                  <BoolField label="Ashkenazi Jewish ancestry" checked={input.familyHistory.ashkenaziJewishAncestry} onChange={(value) => updateGroup("familyHistory", "ashkenaziJewishAncestry", value)} />
                </div>
              </div>
            ) : null}

            {current.key === "personal" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <BoolField label="Previous breast cancer" checked={input.personalHistory.previousBreastCancer} onChange={(value) => updateGroup("personalHistory", "previousBreastCancer", value)} />
                <BoolField label="Previous benign breast disease" checked={input.personalHistory.previousBenignBreastDisease} onChange={(value) => updateGroup("personalHistory", "previousBenignBreastDisease", value)} />
                <BoolField label="Atypical hyperplasia or LCIS on biopsy" checked={input.personalHistory.atypicalHyperplasiaOrLcis} onChange={(value) => updateGroup("personalHistory", "atypicalHyperplasiaOrLcis", value)} />
                <BoolField label="Chest radiotherapy before age 30" checked={input.personalHistory.chestRadiationBeforeAge30} onChange={(value) => updateGroup("personalHistory", "chestRadiationBeforeAge30", value)} />
                <BoolField label="Another cancer diagnosis" checked={input.personalHistory.otherCancerHistory} onChange={(value) => updateGroup("personalHistory", "otherCancerHistory", value)} />
              </div>
            ) : null}

            {current.key === "reproductive" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <BoolField label="First period before age 12" checked={input.reproductiveHistory.menarcheBefore12} onChange={(value) => updateGroup("reproductiveHistory", "menarcheBefore12", value)} />
                <BoolField label="Menopause after age 55" checked={input.reproductiveHistory.menopauseAfter55} onChange={(value) => updateGroup("reproductiveHistory", "menopauseAfter55", value)} />
                <BoolField label="First live birth after age 30" checked={input.reproductiveHistory.firstLiveBirthAfter30} onChange={(value) => updateGroup("reproductiveHistory", "firstLiveBirthAfter30", value)} />
                <BoolField label="Never gave birth" checked={input.reproductiveHistory.neverGaveBirth} onChange={(value) => updateGroup("reproductiveHistory", "neverGaveBirth", value)} />
                <BoolField label="Never breastfed" checked={input.reproductiveHistory.neverBreastfed} onChange={(value) => updateGroup("reproductiveHistory", "neverBreastfed", value)} />
                <BoolField label="Used combined hormone therapy" checked={input.reproductiveHistory.combinedHormoneTherapy} onChange={(value) => updateGroup("reproductiveHistory", "combinedHormoneTherapy", value)} />
                <BoolField label="Currently using hormone therapy" checked={input.reproductiveHistory.currentHormoneTherapy} onChange={(value) => updateGroup("reproductiveHistory", "currentHormoneTherapy", value)} />
              </div>
            ) : null}

            {current.key === "lifestyle" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="BMI" htmlFor="bmi" hint="Approximate is fine; it is only one input among many.">
                  <Input id="bmi" type="number" step="0.1" min={12} max={70} value={input.lifestyle.bmi ?? ""} onChange={(event) => updateGroup("lifestyle", "bmi", Number(event.target.value))} />
                </Field>
                <Field label="Alcohol units per week" htmlFor="alcohol">
                  <Input id="alcohol" type="number" min={0} max={100} value={input.lifestyle.alcoholUnitsPerWeek} onChange={(event) => updateGroup("lifestyle", "alcoholUnitsPerWeek", Number(event.target.value))} />
                </Field>
                <Field label="Physical activity" htmlFor="activity">
                  <Select
                    id="activity"
                    value={input.lifestyle.physicalActivity}
                    onChange={(event) => updateGroup("lifestyle", "physicalActivity", event.target.value as RiskAssessmentInput["lifestyle"]["physicalActivity"])}
                  >
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </Select>
                </Field>
                <Field label="Smoking" htmlFor="smoking">
                  <Select
                    id="smoking"
                    value={input.lifestyle.smokingStatus}
                    onChange={(event) => updateGroup("lifestyle", "smokingStatus", event.target.value as RiskAssessmentInput["lifestyle"]["smokingStatus"])}
                  >
                    <option value="never">Never</option>
                    <option value="former">Former</option>
                    <option value="current">Current</option>
                  </Select>
                </Field>
                <BoolField label="Postmenopausal" checked={input.lifestyle.postmenopausal} onChange={(value) => updateGroup("lifestyle", "postmenopausal", value)} />
              </div>
            ) : null}

            {current.key === "screening" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Months since last mammogram" htmlFor="mammo" hint="Leave 0 if you have never had one.">
                  <Input id="mammo" type="number" min={0} max={600} value={input.screening.lastMammogramMonthsAgo ?? ""} onChange={(event) => updateGroup("screening", "lastMammogramMonthsAgo", Number(event.target.value))} />
                </Field>
                <BoolField label="Told you have dense breast tissue" checked={input.screening.denseBreastTissue} onChange={(value) => updateGroup("screening", "denseBreastTissue", value)} />
                <BoolField label="Screening is up to date for my age" checked={input.screening.screeningUpToDate} onChange={(value) => updateGroup("screening", "screeningUpToDate", value)} />
              </div>
            ) : null}

            {current.key === "symptoms" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Select anything you are currently experiencing. This does not diagnose — it changes how urgently the guidance
                  suggests you seek a clinical review.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SYMPTOM_OPTIONS.map((option) => (
                    <label key={option.code} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/40">
                      <Checkbox
                        checked={input.symptoms.some((symptom) => symptom.code === option.code)}
                        onCheckedChange={(checked) =>
                          setInput((previous) => ({
                            ...previous,
                            symptoms: checked
                              ? [
                                  ...previous.symptoms,
                                  {
                                    code: option.code,
                                    label: option.label,
                                    durationWeeks: 0,
                                    unilateral: true,
                                    progressive: false,
                                    severe: false,
                                  },
                                ]
                              : previous.symptoms.filter((symptom) => symptom.code !== option.code),
                          }))
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {formError ? <ErrorState message={formError} /> : null}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
                <ChevronLeft className="size-4" /> Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}>
                  Next <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button onClick={() => submit.mutate(input)} loading={submit.isPending}>
                  See my indicator
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="How this model works" />
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                {activeModel?.description ??
                  "A rule-based educational model that weights known risk factors. It is not calibrated to a population and is not a diagnostic tool."}
              </p>
              <ul className="space-y-1.5 text-xs">
                <li>• Each answer contributes a weighted score.</li>
                <li>• The normalised total maps to Low, Moderate or High.</li>
                <li>• Red-flag symptoms raise the urgency of the advice.</li>
                <li>• The model is replaceable — a validated clinical model can be swapped in without changing the UI.</li>
              </ul>
            </CardContent>
          </Card>

          {assessments.data && assessments.data.assessments.length > 0 ? (
            <Card>
              <CardHead title="Previous assessments" />
              <CardContent className="space-y-2">
                {assessments.data.assessments.slice(0, 5).map((assessment) => (
                  <button
                    key={assessment.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
                    onClick={() => setResult(assessment)}
                  >
                    <span className="text-muted-foreground">{formatDate(assessment.completedAt)}</span>
                    <Badge tone={RISK_COPY[assessment.level].tone}>{assessment.level}</Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultView({ assessment, onRestart }: { assessment: RiskAssessmentRecord; onRestart: () => void }) {
  const copy = RISK_COPY[assessment.level];
  const urgency = URGENCY_COPY[assessment.urgency];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your educational risk indicator"
        description="This describes the combination of risk factors in your answers. It does not say whether you have breast cancer."
        actions={
          <Button variant="outline" onClick={onRestart}>
            Take it again
          </Button>
        }
      />

      <Card className={copy.tone === "destructive" ? "border-destructive/40" : copy.tone === "warning" ? "border-warning/40" : "border-success/40"}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={copy.tone} className="text-sm">{copy.label}</Badge>
            {urgency ? <Badge tone={urgency.tone}>{urgency.label}</Badge> : null}
          </div>

          <p className="text-lg leading-relaxed">{copy.summary}</p>

          {urgency ? <p className="text-sm text-muted-foreground">{urgency.guidance}</p> : null}

          <div className="rounded-md border bg-muted/40 p-4">
            <p className="text-sm font-medium">Score</p>
            <div className="mt-2 flex items-center gap-3">
              <Progress value={assessment.normalizedScore * 100} className="flex-1" />
              <span className="text-sm tabular-nums text-muted-foreground">
                {assessment.score} / {assessment.maxScore}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Model {assessment.modelId} v{assessment.modelVersion} · assessed {formatDate(assessment.completedAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="Which factors contributed" description="Highest weighted contributions first." />
          <CardContent>
            {assessment.factors.length ? (
              <ul className="space-y-2.5">
                {assessment.factors.map((factor) => (
                  <li key={factor.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block">{factor.label}</span>
                      <span className="block text-xs text-muted-foreground">{factor.explanation}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">+{factor.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No contributing factors recorded" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHead title="What to do next" description="General next steps — your clinician decides what applies to you." />
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {assessment.guidance.map((line) => (
                <li key={line} className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {assessment.redFlags.length ? (
              <Callout tone="warning" title="Flagged in your answers">
                <ul className="space-y-1">
                  {assessment.redFlags.map((flag) => (
                    <li key={flag}>• {flag}</li>
                  ))}
                </ul>
              </Callout>
            ) : null}

            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{assessment.disclaimer}</div>

            <p className="text-xs text-muted-foreground">
              Record hash <code className="font-mono">{shortHash(assessment.contentHash)}</code>
            </p>
          </CardContent>
        </Card>
      </div>

      <HistoryTable assessments={assessment ? [assessment] : []} />
    </div>
  );
}

function HistoryTable({ assessments }: { assessments: RiskAssessmentRecord[] }) {
  return (
    <Card>
      <CardHead title="Assessment history" />
      <CardContent>
        <DataTable<RiskAssessmentRecord>
          rows={assessments}
          columns={historyColumns}
          empty={<EmptyState title="No assessments yet" />}
        />
      </CardContent>
    </Card>
  );
}

const historyColumns: Column<RiskAssessmentRecord>[] = [
  { key: "date", header: "Date", cell: (assessment) => formatDate(assessment.completedAt) },
  { key: "level", header: "Indicator", cell: (assessment) => <Badge tone={RISK_COPY[assessment.level].tone}>{assessment.level}</Badge> },
  { key: "urgency", header: "Suggested timing", cell: (assessment) => URGENCY_COPY[assessment.urgency]?.label ?? assessment.urgency },
  { key: "score", header: "Score", cell: (assessment) => `${assessment.score} / ${assessment.maxScore}` },
  { key: "model", header: "Model", cell: (assessment) => `${assessment.modelId} v${assessment.modelVersion}` },
];

function BoolField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent/40">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{label}</span>
    </label>
  );
}

export { Label, RadioGroup, RadioItem, FieldError };
