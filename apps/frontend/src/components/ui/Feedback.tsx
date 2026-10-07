import { AlertTriangle, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { DEMO_DATA_BANNER, MEDICAL_DISCLAIMER, SHORT_DISCLAIMER } from "@breastcare/shared";
import { cn } from "@/lib/utils";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";

/* ---------------- Loading ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton key={colIndex} className="h-8" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-3 h-3 w-full" />
    </Card>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/* ---------------- Empty & error ---------------- */

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Info className="size-5" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this section",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-4 sm:flex-row sm:items-center", className)}
    >
      <AlertTriangle className="size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">{title}</p>
        {message ? <p className="mt-0.5 text-sm text-muted-foreground">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ---------------- Callouts ---------------- */

const CALLOUT_TONES = {
  info: { border: "border-primary/30", bg: "bg-primary/5", text: "text-primary", Icon: Info },
  warning: { border: "border-warning/40", bg: "bg-warning/5", text: "text-warning", Icon: AlertTriangle },
  danger: { border: "border-destructive/40", bg: "bg-destructive/5", text: "text-destructive", Icon: ShieldAlert },
  success: { border: "border-success/40", bg: "bg-success/5", text: "text-success", Icon: ShieldCheck },
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { border, bg, text, Icon } = CALLOUT_TONES[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3", border, bg, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", text)} />
      <div className="min-w-0 text-sm">
        {title ? <p className={cn("font-semibold", text)}>{title}</p> : null}
        <div className={cn("mt-0.5 space-y-1 text-muted-foreground", title && "mt-1")}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Platform disclaimers ---------------- */

export function DisclaimerCard({
  title = "Medical disclaimer",
  body = MEDICAL_DISCLAIMER,
  className,
}: {
  title?: string;
  body?: string;
  className?: string;
}) {
  return (
    <Callout tone="info" title={title} className={className}>
      <p>{body}</p>
    </Callout>
  );
}

export function ShortDisclaimer({ className }: { className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{SHORT_DISCLAIMER}</p>;
}

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-xs font-medium text-warning">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{DEMO_DATA_BANNER}</span>
    </div>
  );
}

/* ---------------- Page furniture ---------------- */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-xs text-muted-foreground">{breadcrumb}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "muted" | "accent" | "success" | "warning" | "destructive";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <div className="mt-2">
          <Badge tone={tone}>{hint}</Badge>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------- Data table ---------------- */

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  isLoading,
  error,
  empty,
  onRowClick,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  isLoading?: boolean;
  error?: string;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (isLoading) return <TableSkeleton columns={columns.length} />;
  if (error) return <ErrorState message={error} />;
  if (!rows || rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {columns.map((column) => (
              <th key={column.key} className={cn("whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("border-b border-border/60 transition-colors last:border-0 hover:bg-accent/30", onRowClick && "cursor-pointer")}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn("px-4 py-3 align-middle", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Re-exports ---------------- */
/* Dialog pieces live in ./Overlay; pages import the whole feedback vocabulary from here. */
export { Dialog, DialogHeader, DialogBody, DialogFooter } from "./Overlay";
