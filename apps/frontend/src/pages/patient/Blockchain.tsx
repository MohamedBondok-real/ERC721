import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, CheckCircle2, Copy, Link2, ShieldCheck, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { useBlockchain, type BlockchainRecordRow } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { DataTable, Callout, EmptyState, ErrorState, PageHeader, StatCard, type Column } from "@/components/ui/Feedback";
import { Field, Input } from "@/components/ui/Input";
import { formatDateTime, shortHash } from "@/lib/utils";

const STATUS_TONE: Record<BlockchainRecordRow["status"], "muted" | "accent" | "success" | "destructive"> = {
  unanchored: "muted",
  pending: "accent",
  confirmed: "success",
  failed: "destructive",
};

export function BlockchainPage() {
  const { user } = useAuth();
  const overview = useBlockchain();
  const queryClient = useQueryClient();
  const [wallet, setWallet] = useState("");

  if (overview.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Blockchain Integrity" />
        <p className="text-sm text-muted-foreground">Reading chain status…</p>
      </div>
    );
  }
  if (overview.error) return <ErrorState message="We couldn't load the blockchain view." onRetry={() => void overview.refetch()} />;

  const data = overview.data!;
  const { status, registration, trail, records } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blockchain Integrity"
        description="Only identifiers, hashes, consent, permissions and audit timestamps are stored on-chain. Clinical content never leaves the database."
        actions={
          <Button variant="outline" onClick={() => void overview.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Node status"
          value={status.reachable ? "Connected" : status.configured ? "Unreachable" : "Not configured"}
          hint={status.reachable && status.chainId ? `Chain ${status.chainId}` : status.missing.join(", ") || "Offline"}
          icon={<Boxes className="size-4" />}
          tone={status.reachable ? "success" : "muted"}
        />
        <StatCard
          label="Latest block"
          value={status.blockNumber ?? "—"}
          hint={status.reachable ? "Live" : "No node"}
          icon={<Link2 className="size-4" />}
        />
        <StatCard
          label="Audit entries on chain"
          value={data.auditEntryCount ?? "—"}
          hint={data.auditEntryCount === null ? "Chain unavailable" : "Immutable log"}
          icon={<ShieldCheck className="size-4" />}
        />
        <StatCard
          label="Anchored records"
          value={records.filter((record) => record.status === "confirmed").length}
          hint={`${records.length} total`}
          icon={<CheckCircle2 className="size-4" />}
          tone="accent"
        />
      </div>

      {!status.reachable ? (
        <Callout tone="warning" title="Blockchain node is not reachable">
          <p>
            The platform keeps working without a node: hashes are still computed and stored, and access control is still
            enforced by the API. What you lose is the ability to prove a record against an independent ledger.{" "}
            {status.missing.length ? `Missing configuration: ${status.missing.join(", ")}.` : ""}
          </p>
        </Callout>
      ) : null}

      <Card>
        <CardHead
          title="On-chain identity"
          description="Your wallet is pseudonymous. The registry derives your patient identifier from it — no name or clinical data is involved."
        />
        <CardContent className="space-y-4">
          {registration?.registered ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Registered" value={<Badge tone="success">Yes</Badge>} />
              <Row label="On-chain patient id" value={<code className="font-mono text-xs">{shortHash(registration.patientId, 16)}</code>} />
              <Row label="Wallet" value={<code className="font-mono text-xs">{registration.wallet}</code>} />
              <Row label="Pseudonym" value={registration.pseudonym ?? "—"} />
              <Row label="Profile hash" value={<code className="font-mono text-xs">{shortHash(registration.profileHash, 16)}</code>} />
              <Row
                label="Registered at"
                value={registration.registeredAt ? formatDateTime(new Date(registration.registeredAt * 1000).toISOString()) : "—"}
              />
            </dl>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {user?.walletAddress
                  ? "Your wallet is linked, but the registry has no registration for it. This usually means the local chain was reset."
                  : "Link a wallet to register a pseudonymous on-chain identity. This is what makes consent grants and revocations verifiable."}
              </p>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
                    toast.error("Enter a valid 0x wallet address");
                    return;
                  }
                  void api
                    .post("/auth/me/wallet", { walletAddress: wallet })
                    .then(() => {
                      toast.success("Wallet linked");
                      void queryClient.invalidateQueries({ queryKey: queryKeys.blockchain(null) });
                    })
                    .catch((error) => toast.error(errorMessage(error)));
                }}
              >
                <Field label="Wallet address" htmlFor="wallet" className="min-w-[280px] flex-1">
                  <Input id="wallet" value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="0x…" />
                </Field>
                <Button type="submit">Link wallet</Button>
              </form>
              <p className="text-xs text-muted-foreground">
                For local testing you can use a Hardhat account, for example{" "}
                <code className="font-mono">0x70997970C51812dc3A010C7d01b50e0d17dc79C8</code>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHead
          title="Audit trail"
          description="Entries written by AuditLog. Each one carries the actor, the action, a data hash and a timestamp."
          action={<Badge tone={trail ? "success" : "muted"}>{trail ? `${trail.length} entries` : "Chain unavailable"}</Badge>}
        />
        <CardContent>
          {trail && trail.length ? (
            <div className="scrollbar-thin max-h-96 overflow-y-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Actor</th>
                    <th className="px-4 py-2.5">Data hash</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trail].reverse().map((entry) => (
                    <tr key={`${entry.source}-${entry.entryId}`} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{entry.entryId}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{entry.actionLabel ?? entry.action}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{entry.source}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{shortHash(entry.actor, 8)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{shortHash(entry.dataHash, 10)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {formatDateTime(new Date(entry.timestamp * 1000).toISOString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No on-chain audit entries available"
              description="Entries appear here once a blockchain node is reachable and activity has been logged."
              icon={<ShieldCheck className="size-5" />}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHead title="Anchored records" description="Every hash the platform has submitted, with its transaction and block." />
        <CardContent>
          <DataTable<BlockchainRecordRow>
            rows={records}
            columns={recordColumns}
            empty={<EmptyState title="Nothing anchored yet" description="Create a record, plan or consent to anchor its hash." icon={<Link2 className="size-5" />} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHead title="What is and isn't on-chain" />
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-4" /> Stored on-chain
            </p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Pseudonymous patient identifier (derived from your wallet)</li>
              <li>• SHA-256 hashes of records, reports and plans</li>
              <li>• Consent grants, scopes and revocations</li>
              <li>• Audit log entries with actor, action and timestamp</li>
              <li>• Treatment plan identifiers and status changes</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium text-destructive">
              <XCircle className="size-4" /> Never stored on-chain
            </p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Names, dates of birth or contact details</li>
              <li>• Symptom descriptions or clinical notes</li>
              <li>• Risk assessment answers</li>
              <li>• Nutrition logs or meal details</li>
              <li>• Report content or recommendations</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const recordColumns: Column<BlockchainRecordRow>[] = [
  { key: "label", header: "Record", cell: (record) => <span className="font-medium">{record.label}</span> },
  { key: "kind", header: "Kind", cell: (record) => <Badge tone="muted">{record.kind}</Badge> },
  { key: "contract", header: "Contract", cell: (record) => <span className="text-muted-foreground">{record.contract}</span> },
  { key: "hash", header: "Data hash", cell: (record) => <code className="font-mono text-xs">{shortHash(record.dataHash)}</code> },
  {
    key: "tx",
    header: "Transaction",
    cell: (record) =>
      record.transactionHash ? (
        <span className="flex items-center gap-1.5">
          <code className="font-mono text-xs">{shortHash(record.transactionHash)}</code>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy transaction hash"
            onClick={() => {
              void navigator.clipboard?.writeText(record.transactionHash!);
              toast.success("Copied");
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  { key: "block", header: "Block", cell: (record) => <span className="tabular-nums text-muted-foreground">{record.blockNumber ?? "—"}</span> },
  { key: "status", header: "Status", cell: (record) => <Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge> },
  { key: "created", header: "Submitted", cell: (record) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(record.createdAt)}</span> },
];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all">{value}</dd>
    </div>
  );
}
