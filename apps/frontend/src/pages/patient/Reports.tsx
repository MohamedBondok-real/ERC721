import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileText, ShieldCheck, XCircle } from "lucide-react";
import type { MedicalReport } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { useReports } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { DataTable, DialogBody, DialogFooter, DialogHeader, EmptyState, ErrorState, PageHeader, ShortDisclaimer, type Column } from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { formatDate, shortHash } from "@/lib/utils";

interface ReportVerification {
  report: MedicalReport;
  localHash: string;
  storedHash: string;
  localMatches: boolean;
  onChain: { verified: boolean; matches: boolean; onChainHash: string | null; transactionHash: string | null; reason: string | null } | null;
}

export function ReportsPage() {
  const reports = useReports();
  const [open, setOpen] = useState<MedicalReport | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Reports"
        description="Reports written by your clinicians. Each one is hashed, and the hash can be anchored on-chain so the document can be proven unchanged."
      />

      <ShortDisclaimer />

      {reports.error ? <ErrorState message="We couldn't load your reports." onRetry={() => void reports.refetch()} /> : null}

      <DataTable<MedicalReport>
        rows={reports.data?.reports}
        isLoading={reports.isLoading}
        columns={columns({ onOpen: setOpen })}
        empty={
          <EmptyState
            title="No reports yet"
            description="Reports written by a clinician for your record will appear here."
            icon={<FileText className="size-5" />}
          />
        }
      />

      <ReportDialog report={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function columns({ onOpen }: { onOpen: (report: MedicalReport) => void }): Column<MedicalReport>[] {
  return [
    {
      key: "title",
      header: "Report",
      cell: (report) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{report.title}</p>
          <p className="truncate text-xs text-muted-foreground">{report.assessment.slice(0, 90)}</p>
        </div>
      ),
    },
    { key: "date", header: "Date", cell: (report) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(report.date)}</span> },
    { key: "hash", header: "Content hash", cell: (report) => <code className="font-mono text-xs text-muted-foreground">{shortHash(report.contentHash)}</code> },
    {
      key: "anchored",
      header: "On-chain",
      cell: (report) => (report.onChainRecordId ? <Badge tone="success">Anchored</Badge> : <Badge tone="muted">Not anchored</Badge>),
    },
    {
      key: "verification",
      header: "Last check",
      cell: (report) =>
        report.lastVerification ? (
          <Badge tone={report.lastVerification.matches ? "success" : "destructive"}>
            {report.lastVerification.matches ? "Intact" : "Mismatch"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Not checked</span>
        ),
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      cell: (report) => (
        <Button variant="outline" size="sm" onClick={() => onOpen(report)}>
          Open
        </Button>
      ),
    },
  ];
}

function ReportDialog({ report, onClose }: { report: MedicalReport | null; onClose: () => void }) {
  const verify = useMutation({
    mutationFn: (id: string) => api.post<ReportVerification>(`/patients/reports/${id}/verify`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const result = verify.data;

  return (
    <ModalDialog open={Boolean(report)} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader title={report?.title ?? ""} description={report ? `Dated ${formatDate(report.date)}` : undefined} onClose={onClose} />
      <DialogBody className="space-y-5">
        {report ? (
          <>
            <Section heading="Clinical notes" body={report.clinicalNotes} />
            <Section heading="Assessment" body={report.assessment} />
            {report.treatmentInformation ? <Section heading="Treatment information" body={report.treatmentInformation} /> : null}
            <Section heading="Recommendations" body={report.recommendations} />
            {report.followUpDate ? <Section heading="Follow-up" body={formatDate(report.followUpDate)} /> : null}

            <Card>
              <CardHead
                title="Record integrity"
                description="Recomputes the hash from the stored report and compares it with the value held on-chain."
                action={
                  <Button size="sm" variant="outline" onClick={() => verify.mutate(report.id)} loading={verify.isPending}>
                    <ShieldCheck className="size-4" /> Verify Record Integrity
                  </Button>
                }
              />
              <CardContent className="space-y-3">
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <Row label="Stored hash" value={report.contentHash} mono />
                  <Row label="On-chain record id" value={report.onChainRecordId ?? "not anchored"} mono />
                </dl>

                {result ? (
                  <div
                    className={
                      result.localMatches
                        ? "flex items-start gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3"
                        : "flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
                    }
                  >
                    {result.localMatches ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    )}
                    <div className="text-sm">
                      <p className={result.localMatches ? "font-semibold text-success" : "font-semibold text-destructive"}>
                        {result.localMatches ? "Report is intact" : "Hash mismatch detected"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {result.localMatches
                          ? "The recomputed hash equals the stored hash."
                          : "The stored content no longer matches the hash recorded when the report was created."}
                        {result.onChain
                          ? result.onChain.verified
                            ? ` The on-chain value ${result.onChain.matches ? "matches" : "does not match"} the recomputed hash.`
                            : " No on-chain value exists for this report."
                          : ""}
                      </p>
                    </div>
                  </div>
                ) : null}

                {result?.onChain?.transactionHash ? (
                  <p className="text-xs text-muted-foreground">
                    Transaction <code className="font-mono">{shortHash(result.onChain.transactionHash, 16)}</code>
                  </p>
                ) : null}
              </CardContent>
            </Card>
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

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
      <p className="mt-1 whitespace-pre-line text-sm">{body}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 rounded-md border px-2.5 py-1.5">
      <dt>{label}</dt>
      <dd className={mono ? "truncate font-mono" : undefined}>{value.slice(0, 26)}</dd>
    </div>
  );
}
