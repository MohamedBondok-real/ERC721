import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Link2, ShieldCheck, ShieldOff } from "lucide-react";
import { MEDICAL_DISCLAIMER } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useConsents, useGrantees, type ConsentRow } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { DataTable, DialogBody, DialogFooter, DialogHeader, EmptyState, ErrorState, PageHeader, type Column } from "@/components/ui/Feedback";
import { Dialog as ModalDialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { CONSENT_COPY } from "@/lib/format";
import { formatDateTime, shortHash } from "@/lib/utils";

const SCOPE_PRESETS = [
  {
    name: "Clinical review",
    description: "Read access to medical records, risk assessments, symptoms, nutrition plans and reports for clinical care.",
  },
  {
    name: "Treatment coordination",
    description: "Read access to treatment plans, medications and appointments so a specialist can coordinate care.",
  },
  {
    name: "Second opinion",
    description: "Time-limited read access to records and reports for a second clinical opinion.",
  },
];

export function ConsentPage() {
  const queryClient = useQueryClient();
  const consents = useConsents();
  const grantees = useGrantees();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<ConsentRow | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.patient.consent });
    void queryClient.invalidateQueries({ queryKey: queryKeys.patient.access });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  };

  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/consent/${id}/revoke`),
    onSuccess: () => {
      toast.success("Consent revoked");
      setRevoking(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rows = consents.data?.consents ?? [];
  const active = rows.filter((row) => row.effectiveStatus === "active");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consent & Access Control"
        description="You decide who may see your clinical data. Every grant and revocation is recorded, and anchored consents are verified against the blockchain."
        actions={
          <Button onClick={() => setGranting(true)}>
            <ShieldCheck className="size-4" /> Grant access
          </Button>
        }
      />

      <Card className="border-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="text-sm">
            <p className="font-medium">{active.length} active {active.length === 1 ? "grant" : "grants"}</p>
            <p className="text-muted-foreground">
              Clinicians without an active grant cannot open your records. Administrators never have implicit access.
            </p>
          </div>
          <Badge tone={active.length ? "success" : "muted"}>{active.length ? "Access shared" : "Private by default"}</Badge>
        </CardContent>
      </Card>

      {consents.error ? <ErrorState message="We couldn't load your consents." onRetry={() => void consents.refetch()} /> : null}

      <DataTable<ConsentRow>
        rows={rows}
        isLoading={consents.isLoading}
        columns={consentColumns({ onRevoke: setRevoking })}
        empty={
          <EmptyState
            title="No consents yet"
            description="Your record is private. Grant a clinician access when you want them to review it."
            icon={<ShieldCheck className="size-5" />}
          />
        }
      />

      <Card>
        <CardHead title="How access control works" />
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            A clinician can only open your records while a consent grant for them is active. The check runs on every request, not
            once at login.
          </p>
          <p className="flex gap-2">
            <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
            When both you and the clinician have linked wallets, the grant is written to <code className="font-mono">ConsentManager</code>{" "}
            on-chain. Revoking there takes effect immediately and is provable afterwards.
          </p>
          <p className="flex gap-2">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-primary" />
            Every access decision — including denials — is written to the audit log, so you can see who tried to read what.
          </p>
          <p className="rounded-md border bg-muted/40 p-3 text-xs">{MEDICAL_DISCLAIMER}</p>
        </CardContent>
      </Card>

      <GrantDialog
        open={granting}
        onOpenChange={setGranting}
        onGranted={invalidate}
        grantees={grantees.data?.grantees ?? []}
        existingGranteeIds={rows.filter((row) => row.effectiveStatus === "active").map((row) => row.granteeId)}
      />

      <ModalDialog open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogHeader
          title="Revoke this consent?"
          description="The clinician loses access immediately. They keep nothing new, and the revocation is recorded."
          onClose={() => setRevoking(null)}
        />
        <DialogBody>
          {revoking ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{revoking.granteeName}</p>
              <p className="text-muted-foreground">{revoking.scopeName}</p>
              <p className="text-xs text-muted-foreground">{revoking.scopeDescription}</p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setRevoking(null)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => revoking && revoke.mutate(revoking.id)} loading={revoke.isPending}>
            <ShieldOff className="size-4" /> Revoke access
          </Button>
        </DialogFooter>
      </ModalDialog>
    </div>
  );
}

function consentColumns({ onRevoke }: { onRevoke: (row: ConsentRow) => void }): Column<ConsentRow>[] {
  return [
    {
      key: "grantee",
      header: "Granted to",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.granteeName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.granteeType}</p>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.scopeName}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{row.scopeDescription}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <Badge tone={CONSENT_COPY[row.effectiveStatus].tone}>{CONSENT_COPY[row.effectiveStatus].label}</Badge>,
    },
    {
      key: "chain",
      header: "On-chain",
      cell: (row) =>
        row.transactionHash ? (
          row.onChainActive === null ? (
            <Badge tone="muted">Chain unavailable</Badge>
          ) : row.onChainActive ? (
            <Badge tone="success">Active on chain</Badge>
          ) : (
            <Badge tone="destructive">Revoked on chain</Badge>
          )
        ) : (
          <Badge tone="muted">Not anchored</Badge>
        ),
    },
    { key: "granted", header: "Granted", cell: (row) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.grantedAt)}</span> },
    {
      key: "expires",
      header: "Expires",
      cell: (row) => <span className="whitespace-nowrap text-xs text-muted-foreground">{row.expiresAt ? formatDateTime(row.expiresAt) : "No expiry"}</span>,
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      cell: (row) =>
        row.effectiveStatus === "active" ? (
          <Button variant="outline" size="sm" onClick={() => onRevoke(row)}>
            Revoke
          </Button>
        ) : null,
    },
  ];
}

function GrantDialog({
  open,
  onOpenChange,
  onGranted,
  grantees,
  existingGranteeIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGranted: () => void;
  grantees: { id: string; name: string; specialty: string; institution: string; walletLinked: boolean }[];
  existingGranteeIds: string[];
}) {
  const [granteeId, setGranteeId] = useState("");
  const [scopeName, setScopeName] = useState(SCOPE_PRESETS[0]!.name);
  const [scopeDescription, setScopeDescription] = useState(SCOPE_PRESETS[0]!.description);
  const [expiresAt, setExpiresAt] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ consent: unknown; anchored: boolean }>("/consent", {
        granteeId,
        scopeName,
        scopeDescription,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    onSuccess: (result) => {
      toast.success(result.anchored ? "Access granted and anchored on-chain" : "Access granted");
      setGranteeId("");
      onOpenChange(false);
      onGranted();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const chosen = grantees.find((grantee) => grantee.id === granteeId);
  const alreadyGranted = existingGranteeIds.includes(granteeId);

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Grant access"
        description="Access is scoped and revocable. Nothing is shared until you submit."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody className="space-y-4">
        <Field label="Clinician" htmlFor="grantee" required>
          <Select id="grantee" value={granteeId} onChange={(event) => setGranteeId(event.target.value)}>
            <option value="">Select a clinician…</option>
            {grantees.map((grantee) => (
              <option key={grantee.id} value={grantee.id}>
                {grantee.name} — {grantee.specialty}
              </option>
            ))}
          </Select>
        </Field>

        {chosen ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <p>{chosen.institution}</p>
            <p className="mt-1">
              {chosen.walletLinked
                ? "Wallet linked — this grant can be anchored and verified on-chain."
                : "No wallet linked — the grant is enforced by the platform, but there is nothing on-chain to verify against."}
            </p>
          </div>
        ) : null}

        {alreadyGranted ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            This clinician already holds an active grant. Revoke it first if you want to change the scope.
          </p>
        ) : null}

        <Field label="Scope" htmlFor="scope" required>
          <Select
            id="scope"
            value={scopeName}
            onChange={(event) => {
              const preset = SCOPE_PRESETS.find((entry) => entry.name === event.target.value);
              setScopeName(event.target.value);
              if (preset) setScopeDescription(preset.description);
            }}
          >
            {SCOPE_PRESETS.map((preset) => (
              <option key={preset.name} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What does this allow?" htmlFor="description" hint="Stored and hashed; the scope hash is what the contract checks." required>
          <Textarea id="description" rows={3} value={scopeDescription} onChange={(event) => setScopeDescription(event.target.value)} />
        </Field>

        <Field label="Expires" htmlFor="expires" hint="Optional. Leave blank for no expiry.">
          <Input id="expires" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!granteeId || alreadyGranted || scopeDescription.trim().length < 2}
        >
          <Check className="size-4" /> Grant access
        </Button>
      </DialogFooter>
    </ModalDialog>
  );
}

export { shortHash };
