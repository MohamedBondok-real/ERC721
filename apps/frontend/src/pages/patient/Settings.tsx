import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Link2, LogOut, Monitor, Moon, ShieldCheck, Sun, Wallet } from "lucide-react";
import { PRIVACY_STATEMENT } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { Callout, PageHeader } from "@/components/ui/Feedback";
import { Field, Input, Select } from "@/components/ui/Input";
import { cn, shortHash } from "@/lib/utils";

const PHASES = [
  { value: "not-in-treatment", label: "Not in treatment" },
  { value: "diagnosis-workup", label: "Diagnosis work-up" },
  { value: "active-treatment", label: "Active treatment" },
  { value: "recovery", label: "Recovery" },
  { value: "survivorship", label: "Survivorship" },
  { value: "palliative", label: "Palliative care" },
] as const;

export function SettingsPage() {
  const { user, patient, doctor, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState(patient?.displayName ?? doctor?.displayName ?? user?.displayName ?? "");
  const [birthYear, setBirthYear] = useState(String(patient?.birthYear ?? new Date().getFullYear() - 40));
  const [region, setRegion] = useState(patient?.region ?? "");
  const [biologicalSex, setBiologicalSex] = useState(patient?.biologicalSex ?? "prefer-not-to-say");
  const [currentTreatmentPhase, setPhase] = useState(patient?.currentTreatmentPhase ?? "not-in-treatment");
  const [allergies, setAllergies] = useState((patient?.allergies ?? []).join(", "));
  const [comorbidities, setComorbidities] = useState((patient?.comorbidities ?? []).join(", "));
  const [wallet, setWallet] = useState(user?.walletAddress ?? "");

  useEffect(() => {
    setDisplayName(patient?.displayName ?? doctor?.displayName ?? user?.displayName ?? "");
    setBirthYear(String(patient?.birthYear ?? new Date().getFullYear() - 40));
    setRegion(patient?.region ?? "");
    setBiologicalSex(patient?.biologicalSex ?? "prefer-not-to-say");
    setPhase(patient?.currentTreatmentPhase ?? "not-in-treatment");
    setAllergies((patient?.allergies ?? []).join(", "));
    setComorbidities((patient?.comorbidities ?? []).join(", "));
  }, [patient, doctor, user]);

  const savePatient = useMutation({
    mutationFn: () =>
      api.put("/auth/me/patient-profile", {
        displayName,
        birthYear: Number(birthYear),
        biologicalSex,
        region,
        allergies: splitList(allergies),
        comorbidities: splitList(comorbidities),
        currentTreatmentPhase,
      }),
    onSuccess: () => toast.success("Profile updated"),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveDoctor = useMutation({
    mutationFn: () =>
      api.put("/auth/me/doctor-profile", {
        displayName,
        specialty: doctor?.specialty ?? "",
        licenseNumber: doctor?.licenseNumber ?? "",
        institution: doctor?.institution ?? "",
      }),
    onSuccess: () => toast.success("Profile updated"),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const linkWallet = useMutation({
    mutationFn: () =>
    api.post<{ patient: unknown; onChain: { anchored: boolean; transactionHash: string | null } | null }>(
      "/auth/me/wallet",
      { walletAddress: wallet },
    ),
    onSuccess: (result) => {
      if (result.onChain?.anchored) {
        toast.success(`Wallet linked and registered on-chain (${shortHash(result.onChain.transactionHash ?? "", 10)})`);
      } else {
        toast.success("Wallet linked");
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const isPatient = user?.role === "patient";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your account, appearance and privacy controls." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="Account" description="How you appear to your care team." />
          <CardContent className="space-y-4">
            <Field label="Display name" htmlFor="displayName" required>
              <Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>

            {isPatient ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Birth year" htmlFor="birthYear" required>
                    <Input
                      id="birthYear"
                      type="number"
                      min={1900}
                      max={new Date().getFullYear()}
                      value={birthYear}
                      onChange={(event) => setBirthYear(event.target.value)}
                    />
                  </Field>
                  <Field label="Biological sex" htmlFor="sex">
                    <Select
                      id="sex"
                      value={biologicalSex}
                      onChange={(event) => setBiologicalSex(event.target.value as typeof biologicalSex)}
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Region" htmlFor="region" required>
                  <Input id="region" value={region} onChange={(event) => setRegion(event.target.value)} />
                </Field>

                <Field label="Treatment phase" htmlFor="phase">
                  <Select id="phase" value={currentTreatmentPhase} onChange={(event) => setPhase(event.target.value as typeof currentTreatmentPhase)}>
                    {PHASES.map((phase) => (
                      <option key={phase.value} value={phase.value}>
                        {phase.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Allergies" htmlFor="allergies" hint="Comma separated">
                  <Input id="allergies" value={allergies} onChange={(event) => setAllergies(event.target.value)} placeholder="Penicillin, latex" />
                </Field>

                <Field label="Other conditions" htmlFor="comorbidities" hint="Comma separated">
                  <Input id="comorbidities" value={comorbidities} onChange={(event) => setComorbidities(event.target.value)} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Specialty" htmlFor="specialty">
                  <Input id="specialty" value={doctor?.specialty ?? ""} readOnly className="bg-muted/40" />
                </Field>
                <Field label="Institution" htmlFor="institution">
                  <Input id="institution" value={doctor?.institution ?? ""} readOnly className="bg-muted/40" />
                </Field>
              </>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => (isPatient ? savePatient.mutate() : saveDoctor.mutate())}
                loading={savePatient.isPending || saveDoctor.isPending}
              >
                <Check className="size-4" /> Save changes
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Appearance" description="Light, dark, or match your system." />
            <CardContent>
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTheme(option)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                      theme === option ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {option === "light" ? <Sun className="size-4" /> : option === "dark" ? <Moon className="size-4" /> : <Monitor className="size-4" />}
                    {option}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHead
              title="Wallet & on-chain identity"
              description="Linking a wallet lets the platform anchor your pseudonymous identity, so consent grants and record hashes can be verified on-chain."
            />
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={patient?.onChainRegistered ? "success" : "muted"}>
                  {patient?.onChainRegistered ? "Registered on-chain" : "Not registered"}
                </Badge>
                {user?.walletAddress ? (
                  <span className="font-mono text-xs text-muted-foreground">{shortHash(user.walletAddress, 12)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">No wallet linked</span>
                )}
              </div>

              {patient?.onChainPatientId ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <p className="text-muted-foreground">On-chain patient identifier</p>
                  <code className="font-mono break-all">{patient.onChainPatientId}</code>
                </div>
              ) : null}

              <Field label="Wallet address" htmlFor="wallet" hint="A 0x address. For local testing, any Hardhat account works.">
                <Input id="wallet" value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="0x…" />
              </Field>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => linkWallet.mutate()}
                  loading={linkWallet.isPending}
                  disabled={!/^0x[0-9a-fA-F]{40}$/.test(wallet)}
                >
                  <Wallet className="size-4" /> Link wallet
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Your wallet is never associated with your name on-chain. Only a pseudonymous identifier and hashes are stored.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHead title="Privacy" />
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{PRIVACY_STATEMENT}</p>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-muted-foreground">
                  Clinicians only see your clinical data while a consent grant is active. Administrators never have implicit
                  access to medical records.
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-muted-foreground">
                  Your medical content is stored in the database, never on the blockchain. Only hashes and consent state are
                  anchored.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHead title="Session" />
            <CardContent className="space-y-3">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</dt>
                  <dd className="mt-0.5">{user?.email}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
                  <dd className="mt-0.5 capitalize">{user?.role}</dd>
                </div>
              </dl>
              <Button variant="outline" onClick={logout}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Callout tone="info" title="Demo environment">
        <p>
          This deployment runs on fictional demo data. Please do not enter real patient information into any field on this
          platform.
        </p>
      </Callout>
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
