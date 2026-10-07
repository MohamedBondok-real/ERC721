import { Link } from "react-router-dom";
import { DEMO_DATA_BANNER } from "@breastcare/shared";
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  FileLock2,
  HeartPulse,
  Link2,
  Salad,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { MEDICAL_DISCLAIMER, NUTRITION_DISCLAIMER, RISK_ASSESSMENT_DISCLAIMER } from "@breastcare/shared";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DemoBanner } from "@/components/ui/Feedback";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun } from "lucide-react";

const SECTIONS = [
  {
    icon: Activity,
    title: "Risk Awareness",
    body: "An educational questionnaire turns family history, personal history and lifestyle into a Low, Moderate or High risk indicator with plain-language guidance. It is a prompt to talk to a clinician — never a diagnosis.",
    points: ["Replaceable risk-model interface", "Explains which answers moved the score", "Clear next-step guidance"],
  },
  {
    icon: Salad,
    title: "Nutrition",
    body: "Phase-based guidance for treatment, recovery and survivorship, plus support for appetite loss, nausea, taste changes, mouth discomfort, constipation, diarrhoea and fatigue.",
    points: ["No calorie or macro prescription", "No cure claims, no restrictive diets", "Reviewed by your clinical team"],
  },
  {
    icon: HeartPulse,
    title: "Treatment Tracking",
    body: "Treatment plans move through proposed, authorized, active, on-hold, completed and cancelled states. Medication schedules show what is due; only your prescriber can change a dose.",
    points: ["Plan status history", "Dose logging without dose editing", "Missed-dose prompts for your care team"],
  },
  {
    icon: Stethoscope,
    title: "Patient Monitoring",
    body: "Symptom reports, red-flag patterns and appointment follow-up give clinicians a current picture between visits, and give patients a record of what they reported and when.",
    points: ["Red-flag symptoms surfaced first", "Longitudinal timeline", "Educational guidance per symptom"],
  },
  {
    icon: FileLock2,
    title: "Secure Records",
    body: "Medical records, reports and assessments are stored off-chain and encrypted at field level. Each one carries a content hash so tampering can be detected after the fact.",
    points: ["Field-level encryption", "Content hash per record", "No medical data in URLs"],
  },
  {
    icon: Link2,
    title: "Blockchain Integrity",
    body: "Only pseudonymous identifiers, content hashes, consent state, permissions and audit entries go on-chain. Patient data never does.",
    points: ["On-chain consent registry", "Append-only audit log", "Verify record integrity in one click"],
  },
  {
    icon: Users,
    title: "Doctor Collaboration",
    body: "Clinicians see only the patients who granted them consent. Notes, reports and treatment plans are shared inside that grant, and access ends the moment consent is revoked.",
    points: ["Consent-derived patient list", "Shared plans and reports", "Access decisions are logged"],
  },
  {
    icon: Bot,
    title: "AI Insights",
    body: "An educational assistant answers from the platform's own knowledge base. It will not diagnose, prescribe, change a dosage or advise stopping treatment — it points you to your care team instead.",
    points: ["Refuses diagnostic requests", "Refuses medication changes", "Escalates urgent symptoms"],
  },
];

const TRUST_POINTS = [
  "Doctors cannot open a patient record without explicit, revocable patient consent.",
  "Administrators have no automatic access to clinical records — an explicit grant is required.",
  "The blockchain holds identifiers, hashes, consent, permissions and audit entries. Nothing clinical.",
  "Risk and nutrition content is informational only and labelled as such everywhere it appears.",
];

export function Landing() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <DemoBanner />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="clinical-shell flex h-16 items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
                <path d="M16 27s-9-5.4-9-11.7A5.2 5.2 0 0 1 16 11.4a5.2 5.2 0 0 1 9 3.9C25 21.6 16 27 16 27Z" fill="currentColor" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight">BreastCare AI</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <a href="#risk-awareness" className="transition-colors hover:text-foreground">Risk Awareness</a>
            <a href="#nutrition" className="transition-colors hover:text-foreground">Nutrition</a>
            <a href="#secure-records" className="transition-colors hover:text-foreground">Secure Records</a>
            <a href="#blockchain" className="transition-colors hover:text-foreground">Blockchain</a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/register">
                Get Started <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_70%_-10%,hsl(var(--primary)/0.12),transparent)]" aria-hidden />
        <div className="clinical-shell relative grid gap-10 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div>
            <Badge tone="accent" className="mb-5">
              <ShieldCheck className="size-3.5" /> Clinical decision support · not a diagnostic device
            </Badge>

            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              Smarter Breast Cancer Care Through Data, Nutrition &amp; Secure Technology
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              BreastCare AI brings breast cancer awareness, educational risk assessment, nutrition guidance, treatment and
              medication tracking, clinician collaboration and consent-based record integrity into one workspace — while keeping
              every clinical decision exactly where it belongs: with a qualified healthcare professional.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link to="/register">
                  Get Started <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">Explore Platform</Link>
              </Button>
            </div>

            <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card className="self-start p-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">How a result is worded</p>
            <p className="mt-3 text-2xl font-semibold text-warning">Moderate risk indicators</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your responses indicate that professional medical evaluation may be appropriate.
            </p>
            <div className="mt-4 space-y-2 text-xs">
              <p className="font-medium text-foreground">What this is not:</p>
              <p className="text-muted-foreground">
                A result never says whether you have breast cancer. It describes the combination of risk factors in your answers
                and suggests how soon to speak to a clinician.
              </p>
            </div>
            <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">{RISK_ASSESSMENT_DISCLAIMER}</p>
          </Card>
        </div>
      </section>

      {/* Feature sections */}
      <section className="clinical-shell py-16">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight">Everything the care journey needs, nothing it shouldn't claim</h2>
          <p className="mt-3 text-muted-foreground">
            Eight connected areas, each with an explicit boundary on what the software is allowed to say.
          </p>
        </div>

        <div id="risk-awareness" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon;
            const anchorId = index === 1 ? "nutrition" : index === 4 ? "secure-records" : index === 5 ? "blockchain" : undefined;
            return (
              <Card key={section.title} id={anchorId} className="flex flex-col p-5">
                <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4.5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{section.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
                <ul className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                  {section.points.map((point) => (
                    <li key={point} className="flex gap-1.5">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Nutrition disclaimer band */}
      <section className="border-y bg-muted/40">
        <div className="clinical-shell grid gap-6 py-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Nutrition guidance with honest limits</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Plans are built for the phase you are in and the side effects you report. They suggest meals, hydration and
              food groups to emphasise or discuss with your clinician — they never prescribe calorie targets, promise a cure or
              recommend a restrictive diet during treatment.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["During Treatment", "Recovery", "Survivorship", "Side-Effect Support"].map((phase) => (
              <Card key={phase} className="p-4">
                <p className="text-sm font-medium">{phase}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {phase === "Side-Effect Support"
                    ? "Appetite loss, nausea, taste changes, mouth discomfort, constipation, diarrhoea, fatigue."
                    : "Meal ideas, hydration targets and food groups to emphasise or discuss with your team."}
                </p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground lg:col-span-2">{NUTRITION_DISCLAIMER}</p>
        </div>
      </section>

      {/* Consent + integrity */}
      <section className="clinical-shell grid gap-8 py-16 lg:grid-cols-2">
        <Card className="p-6">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarCheck className="size-4" />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Consent decides who sees what</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A clinician's patient list is built from active consent grants — there is no "all patients" view. Revoke a grant and
            access stops immediately, and the refusal is written to the audit trail.
          </p>
        </Card>
        <Card className="p-6">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileLock2 className="size-4" />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Integrity you can verify yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Every report and record has a content hash anchored on-chain. "Verify Record Integrity" recomputes the hash locally
            and compares it with the chain, so an altered document is visible to the patient, not just to the platform.
          </p>
        </Card>
      </section>

      {/* Disclaimer */}
      <section className="border-t bg-destructive/5">
        <div className="clinical-shell py-12">
          <h2 className="text-lg font-semibold">Medical disclaimer</h2>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{MEDICAL_DISCLAIMER}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            In an emergency — heavy bleeding, chest pain, breathing difficulty, high fever or confusion — contact emergency
            services or go to the nearest emergency department immediately.
          </p>
        </div>
      </section>

      <footer className="border-t">
        <div className="clinical-shell flex flex-col gap-3 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>BreastCare AI — educational and clinical decision support. {DEMO_DATA_BANNER}</p>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
            <Link to="/register" className="hover:text-foreground">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
