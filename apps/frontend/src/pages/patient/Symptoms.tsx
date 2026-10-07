import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, Stethoscope } from "lucide-react";
import { EMERGENCY_STATEMENT } from "@breastcare/shared";
import type { SymptomReport } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useRedFlags, useSymptomCatalogue, useSymptoms } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  DataTable,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ShortDisclaimer,
  type Column,
} from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Input";
import { SEVERITY_COPY } from "@/lib/format";
import { formatDateTime, fromNow } from "@/lib/utils";

export function SymptomsPage() {
  const queryClient = useQueryClient();
  const symptoms = useSymptoms();
  const catalogue = useSymptomCatalogue();
  const redFlags = useRedFlags();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Symptom Tracking"
        description="Record what you notice over time. Patterns are useful context for your clinician — they are not a diagnosis."
        actions={
          <Button onClick={() => setOpen(true)}>
            <ClipboardList className="size-4" /> Report a symptom
          </Button>
        }
      />

      <ShortDisclaimer />

      {redFlags.data?.categories.length ? (
        <Card className="border-warning/40">
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-sm font-medium">{redFlags.data.categories[0]?.title}</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {redFlags.data.categories.map((category) => (
                <li key={category.id} className="rounded-md border px-3 py-2">
                  <p className="font-medium text-foreground">{category.title}</p>
                  <p className="mt-0.5 text-xs">{category.signs.join(" · ")}</p>
                  <p className="mt-1 text-xs text-warning">{category.action}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{redFlags.data.emergency || EMERGENCY_STATEMENT}</p>
          </CardContent>
        </Card>
      ) : null}

      {symptoms.error ? <ErrorState message="We couldn't load your symptom reports." onRetry={() => void symptoms.refetch()} /> : null}

      <DataTable<SymptomReport>
        rows={symptoms.data?.symptoms}
        isLoading={symptoms.isLoading}
        columns={columns}
        empty={
          <EmptyState
            title="No symptom reports yet"
            description="Reporting a symptom helps you and your clinician track changes over time."
            icon={<Stethoscope className="size-5" />}
          />
        }
      />

      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.patient.symptoms });
          void queryClient.invalidateQueries({ queryKey: queryKeys.patient.overview });
          void queryClient.invalidateQueries({ queryKey: queryKeys.patient.timeline });
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        }}
        catalogue={catalogue.data?.symptoms ?? []}
      />
    </div>
  );
}

const columns: Column<SymptomReport>[] = [
  {
    key: "symptom",
    header: "Symptom",
    cell: (report) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{report.label}</p>
        <p className="truncate text-xs text-muted-foreground">{report.code}</p>
      </div>
    ),
  },
  {
    key: "severity",
    header: "Severity",
    cell: (report) => <Badge tone={SEVERITY_COPY[report.severity].tone}>{SEVERITY_COPY[report.severity].label}</Badge>,
  },
  {
    key: "side",
    header: "Side",
    cell: (report) => (report.side === "not-applicable" ? "—" : <span className="capitalize">{report.side}</span>),
  },
  {
    key: "duration",
    header: "Duration",
    cell: (report) =>
      report.durationWeeks === 0 ? "Just noticed" : `${report.durationWeeks} week${report.durationWeeks === 1 ? "" : "s"}`,
  },
  {
    key: "progressive",
    header: "Changing?",
    cell: (report) => (report.progressive ? <Badge tone="warning">Getting worse</Badge> : <span className="text-muted-foreground">Stable</span>),
  },
  {
    key: "flag",
    header: "",
    cell: (report) => (report.redFlag ? <Badge tone="destructive">Needs clinical review</Badge> : null),
  },
  {
    key: "notes",
    header: "Notes",
    cell: (report) => <span className="line-clamp-1 text-sm text-muted-foreground">{report.notes ?? "—"}</span>,
  },
  {
    key: "reported",
    header: "Reported",
    cell: (report) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDateTime(report.reportedAt)}>
        {fromNow(report.reportedAt)}
      </span>
    ),
  },
];

interface CatalogueItem {
  code: string;
  label: string;
  description: string;
}

function ReportDialog({
  open,
  onOpenChange,
  onCreated,
  catalogue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  catalogue: CatalogueItem[];
}) {
  const [code, setCode] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("mild");
  const [side, setSide] = useState<"left" | "right" | "both" | "not-applicable">("not-applicable");
  const [durationWeeks, setDurationWeeks] = useState(0);
  const [progressive, setProgressive] = useState(false);
  const [notes, setNotes] = useState("");
  const [guidance, setGuidance] = useState<{ redFlag: boolean; guidance: string } | null>(null);

  const selected = catalogue.find((item) => item.code === code);

  const submit = useMutation({
    mutationFn: () =>
      api.post<SymptomReport>("/patients/symptoms", {
        code,
        severity,
        side,
        durationWeeks,
        progressive,
        notes: notes || null,
      }),
    onSuccess: (report) => {
      toast.success("Symptom recorded");
      setGuidance({ redFlag: report.redFlag, guidance: report.guidance });
      setCode("");
      setNotes("");
      onCreated();
      if (report.redFlag) {
        toast.warning("This symptom is flagged for prompt clinical review");
        onOpenChange(false);
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Report a symptom"
        description="Anything you record stays in your medical record. Only a hash is ever anchored on-chain."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody className="space-y-4">
        <Field label="Symptom" htmlFor="symptom" required>
          <Select id="symptom" value={code} onChange={(event) => { setCode(event.target.value); setGuidance(null); }}>
            <option value="">Select a symptom…</option>
            {catalogue.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        {selected ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{selected.description}</p>
        ) : null}

        {guidance ? (
          <div
            className={
              guidance.redFlag
                ? "rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
                : "rounded-md border px-3 py-2 text-xs text-muted-foreground"
            }
          >
            {guidance.guidance}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Severity" htmlFor="severity">
            <Select id="severity" value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </Select>
          </Field>
          <Field label="Which side?" htmlFor="side">
            <Select id="side" value={side} onChange={(event) => setSide(event.target.value as typeof side)}>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="both">Both</option>
              <option value="not-applicable">Not applicable</option>
            </Select>
          </Field>
        </div>

        <Field label="How many weeks have you had it?" htmlFor="duration" hint="Use 0 if you only just noticed it.">
          <Input
            id="duration"
            type="number"
            min={0}
            max={1200}
            value={durationWeeks}
            onChange={(event) => setDurationWeeks(Number(event.target.value))}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent/40">
          <Checkbox checked={progressive} onCheckedChange={(value) => setProgressive(value === true)} />
          <span>It is getting worse over time</span>
        </label>

        <Field label="Anything else?" htmlFor="notes">
          <Textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="When it happens, what makes it better or worse…"
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          Recording a symptom never produces a diagnosis. If something worries you, contact your care team.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!code}>
          Save report
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}
