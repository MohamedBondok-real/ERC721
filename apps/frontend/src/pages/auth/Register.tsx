import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { MEDICAL_DISCLAIMER } from "@breastcare/shared";
import { errorMessage, fieldErrors } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { homePathFor } from "@/lib/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Label, RadioGroup, RadioItem, Select } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Feedback";

const registerSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    displayName: z.string().trim().min(2, "Enter your name").max(120),
    role: z.enum(["patient", "doctor"]),
    birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().or(z.literal("")),
    specialty: z.string().trim().max(120).optional(),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a number"),
    confirmPassword: z.string(),
    acceptedDisclaimer: z.literal(true, { errorMap: () => ({ message: "You must acknowledge the medical disclaimer" }) }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type RegisterForm = z.infer<typeof registerSchema>;

const currentYear = new Date().getFullYear();

export function Register() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      displayName: "",
      role: "patient",
      birthYear: "",
      specialty: "",
      password: "",
      confirmPassword: "",
      acceptedDisclaimer: false as unknown as true,
    },
  });

  const role = form.watch("role");

  async function onSubmit(values: RegisterForm) {
    setGlobalError(null);
    setServerErrors({});
    try {
      const user = await registerAccount({
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        displayName: values.displayName,
        role: values.role,
        birthYear: values.birthYear === "" ? undefined : Number(values.birthYear),
        acceptedDisclaimer: true,
      });
      toast.success("Account created");
      navigate(homePathFor(user.role), { replace: true });
    } catch (error) {
      setServerErrors(fieldErrors(error));
      setGlobalError(errorMessage(error, "We couldn't create your account."));
    }
  }

  const errorFor = (field: string) => serverErrors[field] ?? form.formState.errors[field as keyof RegisterForm]?.message;

  return (
    <div className="min-h-screen">
      <div className="clinical-shell max-w-2xl py-12">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to overview
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Create your BreastCare AI account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose the account type that matches how you will use the platform. You can link a wallet later for on-chain consent.
        </p>

        <form className="mt-8 space-y-5" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          {globalError ? (
            <Callout tone="danger" title="Registration failed">
              <p>{globalError}</p>
            </Callout>
          ) : null}

          <Field label="Account type" required>
            <RadioGroup
              value={role}
              onValueChange={(value) => form.setValue("role", value as "patient" | "doctor")}
              className="sm:grid-cols-2"
            >
              <RadioItem
                value="patient"
                label="Patient"
                description="Track your own assessments, symptoms, nutrition, treatment and records."
              />
              <RadioItem
                value="doctor"
                label="Clinician"
                description="Manage consenting patients, plans, medications and reports."
              />
            </RadioGroup>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="displayName" error={errorFor("displayName")} required>
              <Input id="displayName" autoComplete="name" placeholder="Alex Morgan" {...form.register("displayName")} />
            </Field>

            <Field label="Email" htmlFor="email" error={errorFor("email")} required>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
            </Field>

            {role === "patient" ? (
              <Field label="Year of birth" htmlFor="birthYear" hint="Used only to calculate age for the educational risk model.">
                <Input id="birthYear" type="number" min={1900} max={currentYear} placeholder="1975" {...form.register("birthYear")} />
              </Field>
            ) : (
              <Field label="Specialty" htmlFor="specialty" hint="Shown to patients when they choose who to grant access to.">
                <Input id="specialty" placeholder="Breast surgery" {...form.register("specialty")} />
              </Field>
            )}

            <Field label="Preferred contact method" htmlFor="contact">
              <Select id="contact" defaultValue="email">
                <option value="email">Email</option>
                <option value="portal">Platform notification</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Password"
              htmlFor="password"
              error={errorFor("password")}
              hint="At least 10 characters with upper case, lower case and a number."
              required
            >
              <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
            </Field>

            <Field label="Confirm password" htmlFor="confirmPassword" error={errorFor("confirmPassword")} required>
              <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
            </Field>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <Label className="text-sm font-semibold">Medical disclaimer</Label>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{MEDICAL_DISCLAIMER}</p>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={form.watch("acceptedDisclaimer") === true}
                onCheckedChange={(checked) => form.setValue("acceptedDisclaimer", checked === true ? true : (false as unknown as true), { shouldValidate: true })}
                id="acceptedDisclaimer"
              />
              <span className="text-sm">
                I understand that BreastCare AI is educational, does not provide a medical diagnosis, and does not replace a
                qualified healthcare professional.
              </span>
            </label>
            {errorFor("acceptedDisclaimer") ? <p className="mt-2 text-xs text-destructive">{errorFor("acceptedDisclaimer")}</p> : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create account
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link to="/login">I already have an account</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
