import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { medicalRecordSchema } from "@breastcare/shared";
import type { MedicalRecordEntry } from "@breastcare/shared";
import { toast } from "sonner";
import { CheckCircle2, Copy, FileText, ShieldCheck, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useRecords } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, Dialog, DialogBody, DialogFooter, DialogHeader, EmptyState, ErrorState, PageHeader, ShortDisclaimer, type Column } from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { cn, formatDate, shortHash } from "@/lib/utils";

const RECORD_KINDS = [
  "medical-history",
  "family-history",
  "symptom",
  "lab-result",
  "imaging",
  "treatment",
  "medication",
  "nutrition",
  "doctor-note",
] as const;

interface VerificationResult {
  record: MedicalRecordEntry;
  localHash: string;
  storedHash: string;
  localMatches: boolean;
  onChain: { verified: boolean; matches: boolean; onChainHash: string | null; transactionHash: string | null; reason: string | null } | null;
}

export function RecordsPage() {
  const queryClient = useQueryClient();
  const records = useRecords();
  const [creating, setCreating] = useState(false);
  const [verifyFor, setVerifyFor] = useState<MedicalRecordEntry | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.patient.records });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Records"
        description="Every entry carries a content hash. Anchored hashes let you prove a record has not been altered since it was written."
        actions={
          <Button onClick={() => setCreating(true)}>
            <FileText className="size-4" /> Add record
          </Button>
        }
      />

      <ShortDisclaimer />

      {records.error ? <ErrorState message="We couldn't load your records." onRetry={() => void records.refetch()} /> : null}

      <DataTable<MedicalRecordEntry>
        rows={records.data?.records}
        isLoading={records.isLoading}
        columns={columns({ onVerify: setVerifyFor })}
        empty={<EmptyState title="No records yet" description="Add a record or let your clinician add notes to your file." icon={<FileText className="size-5" />} />}
      />

      <CreateRecordDialog open={creating} onOpenChange={setCreating} onCreated={invalidate} />
      <VerifyDialog record={verifyFor} onClose={() => setVerifyFor(null)} />
    </div>
  );
}

function columns({ onVerify }: { onVerify: (record: MedicalRecordEntry) => void }): Column<MedicalRecordEntry>[] {
  return [
    {
      key: "kind",
      header: "Type",
      cell: (record) => <Badge tone={record.kind === "doctor-note" ? "accent" : "muted"}>{record.kind.replace(/-/g, " ")}</Badge>,
    },
    {
      key: "title",
      header: "Record",
      cell: (record) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{record.title}</p>
          <p className="truncate text-xs text-muted-foreground">{record.summary}</p>
        </div>
      ),
    },
    { key: "createdAt", header: "Created", cell: (record) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(record.createdAt)}</span> },
    {
      key: "hash",
      header: "Content hash",
      cell: (record) => <code className="font-mono text-xs text-muted-foreground">{shortHash(record.contentHash)}</code>,
    },
    {
      key: "anchored",
      header: "On-chain",
      cell: (record) =>
        record.onChainRecordId ? <Badge tone="success">Anchored</Badge> : <Badge tone="muted">Not anchored</Badge>,
    },
    {
      key: "verify",
      header: "",
      className: "text-right",
      cell: (record) => (
        <Button variant="outline" size="sm" onClick={() => onVerify(record)}>
          <ShieldCheck className="size-4" /> Verify integrity
        </Button>
      ),
    },
  ];
}

function CreateRecordDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const form = useForm({
    resolver: zodResolver(medicalRecordSchema),
    defaultValues: { kind: "medical-history" as (typeof RECORD_KINDS)[number], title: "", summary: "", body: "" },
  });

  const create = useMutation({
    mutationFn: (values: unknown) => api.post<MedicalRecordEntry>("/patients/records", values),
    onSuccess: () => {
      toast.success("Record added and hashed");
      form.reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader title="Add a medical record" description="The content is hashed and stored off-chain. Only the hash can be anchored." onClose={() => onOpenChange(false)} />
      <DialogBody>
        <form id="create-record" className="space-y-4" onSubmit={form.handleSubmit((values) => create.mutate(values))} noValidate>
          <Field label="Type" htmlFor="kind" required>
            <Select id="kind" {...form.register("kind")}>
              {RECORD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replace(/-/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="title" error={form.formState.errors.title?.message} required>
            <Input id="title" placeholder="Full blood count, March" {...form.register("title")} />
          </Field>
          <Field label="Summary" htmlFor="summary" error={form.formState.errors.summary?.message} required>
            <Input id="summary" placeholder="One-line summary" {...form.register("summary")} />
          </Field>
          <Field label="Detail" htmlFor="body" error={form.formState.errors.body?.message} required>
            <Textarea id="body" rows={5} placeholder="Values, dates, context…" {...form.register("body")} />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" form="create-record" loading={create.isPending}>
          Save record
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

function VerifyDialog({ record, onClose }: { record: MedicalRecordEntry | null; onClose: () => void }) {
  const verify = useMutation({
    mutationFn: (id: string) => api.post<VerificationResult>(`/patients/records/${id}/verify`),
  });

  const result = verify.data;

  return (
    <ModalDialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader
        title="Verify record integrity"
        description="Recomputes the hash from the stored content and compares it with the anchored value."
        onClose={onClose}
      />
      <DialogBody className="space-y-4">
        {record ? (
          <>
            <div>
              <p className="text-sm font-medium">{record.title}</p>
              <p className="text-xs text-muted-foreground">{record.summary}</p>
            </div>

            {!verify.data && !verify.isPending && !verify.error ? (
              <Button onClick={() => verify.mutate(record.id)} className="w-full">
                <ShieldCheck className="size-4" /> Verify Record Integrity
              </Button>
            ) : null}

            {verify.isPending ? <p className="text-sm text-muted-foreground">Recomputing and comparing hashes…</p> : null}

            {verify.error ? <ErrorState message={errorMessage(verify.error)} onRetry={() => verify.mutate(record.id)} /> : null}

            {result ? (
              <div className="space-y-3">
                <div
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-4 py-3",
                    result.localMatches ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  {result.localMatches ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                  )}
                  <div className="text-sm">
                    <p className={cn("font-semibold", result.localMatches ? "text-success" : "text-destructive")}>
                      {result.localMatches ? "Record is intact" : "Hash mismatch — the stored content no longer matches its hash"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {result.localMatches
                        ? "The recomputed hash equals the stored hash, so the content has not changed since it was written."
                        : "The content differs from the value recorded at creation time. Contact your care team before relying on this record."}
                    </p>
                  </div>
                </div>

                <HashRow label="Stored hash" value={result.storedHash} />
                <HashRow label="Recomputed hash" value={result.localHash} />

                {result.onChain ? (
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">On-chain comparison</p>
                    <dl className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between gap-4">
                        <dt>Exists on chain</dt>
                        <dd>{String(result.onChain.verified)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Hash matches chain</dt>
                        <dd>{String(result.onChain.matches)}</dd>
                      </div>
                      {result.onChain.transactionHash ? (
                        <div className="flex justify-between gap-4">
                          <dt>Transaction</dt>
                          <dd className="font-mono">{shortHash(result.onChain.transactionHash)}</dd>
                        </div>
                      ) : (
                        <p className="pt-1">This record was created while no blockchain node was configured, so there is nothing on-chain to compare against.</p>
                      )}
                    </dl>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <code className="font-mono text-xs">{value.slice(0, 24)}…</code>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.success("Copied");
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      </span>
    </div>
  );
}

export { CreateRecordDialog };
export type { VerificationResult };
