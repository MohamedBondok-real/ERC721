import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { DEMO_DATA_BANNER, MEDICAL_DISCLAIMER } from "@breastcare/shared";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { homePathFor } from "@/lib/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Feedback";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface DemoAccount {
  role: string;
  email: string;
  password: string;
  label: string;
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: ({ signal }) =>
      api.get<{ disclaimer: string; demoBanner: string; demoMode: boolean; blockchain: { reachable: boolean } }>(
        "/auth/meta",
        undefined,
        signal,
      ),
  });

  const demoAccounts = useQuery({
    queryKey: ["demo-accounts"],
    queryFn: async ({ signal }): Promise<readonly DemoAccount[]> => {
      // The demo account list ships with the frontend bundle; credentials are published on purpose
      // so reviewers can explore the platform. Demo mode is disabled in production.
      void signal;
      const module = await import("@/lib/demoAccounts");
      return module.DEMO_ACCOUNTS as readonly DemoAccount[];
    },
  });

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginForm) {
    setGlobalError(null);
    setServerErrors({});
    try {
      const user = await login(values.email, values.password);
      toast.success(`Signed in as ${user.displayName}`);
      navigate(homePathFor(user.role), { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setServerErrors(fields);
      setGlobalError(errorMessage(error, "Sign in failed. Please check your credentials."));
    }
  }

  function useDemo(account: DemoAccount) {
    form.reset({ email: account.email, password: account.password });
    setGlobalError(null);
    setServerErrors({});
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to overview
        </Link>

        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to BreastCare AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access to clinical content is governed by patient consent. Signing in does not grant access to anyone's record.
          </p>

          <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{meta.data?.demoBanner ?? DEMO_DATA_BANNER}</p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {globalError ? (
              <Callout tone="danger" title="Sign in failed">
                <p>{globalError}</p>
              </Callout>
            ) : null}

            <Field label="Email" htmlFor="email" error={serverErrors.email ?? form.formState.errors.email?.message} required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...form.register("email")}
              />
            </Field>

            <Field label="Password" htmlFor="password" error={serverErrors.password ?? form.formState.errors.password?.message} required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                {...form.register("password")}
              />
            </Field>

            <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
              Sign in
            </Button>
          </form>

          {demoAccounts.data && demoAccounts.data.length > 0 ? (
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo accounts (fictional)</p>
              <div className="mt-3 space-y-2">
                {demoAccounts.data.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => useDemo(account)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{account.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
                    </span>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                      {account.role}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Selecting an account fills the form. All demo patients, clinicians, records and blockchain entries are fictional.
              </p>
            </div>
          ) : null}

          <p className="mt-8 text-sm text-muted-foreground">
            No account yet?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden flex-col justify-between border-l bg-muted/30 p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <span className="text-sm font-semibold">BreastCare AI</span>
        </div>

        <div className="max-w-md space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">Consent-first access to clinical records</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {[
              "A clinician sees only the patients who granted them consent.",
              "Consent can be revoked at any time; access ends immediately.",
              "Administrators have no automatic access to medical records.",
              "Only hashes, identifiers, consent and audit entries are written to the blockchain.",
            ].map((point) => (
              <li key={point} className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{meta.data?.disclaimer ?? MEDICAL_DISCLAIMER}</p>
      </div>
    </div>
  );
}
