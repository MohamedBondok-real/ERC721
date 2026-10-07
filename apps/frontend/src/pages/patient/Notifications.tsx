import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import type { Notification } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState, ErrorState, PageHeader, StatCard } from "@/components/ui/Feedback";
import { NOTIFICATION_TONE } from "@/lib/format";
import { cn, formatDateTime, fromNow } from "@/lib/utils";

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) =>
      api.get<{ notifications: Notification[]; unread: number }>("/notifications", undefined, signal),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: () => api.post<{ updated: number }>("/notifications/read-all"),
    onSuccess: (result) => {
      toast.success(`${result.updated} notification${result.updated === 1 ? "" : "s"} marked as read`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rows = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Reminders about appointments, medication, new reports and consent changes."
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={unread === 0}>
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Unread" value={unread} icon={<Bell className="size-4" />} tone={unread ? "warning" : "muted"} />
        <StatCard label="Total" value={rows.length} icon={<BellOff className="size-4" />} />
        <StatCard
          label="Critical"
          value={rows.filter((row) => row.severity === "critical").length}
          hint="Needs attention"
          tone="destructive"
        />
      </div>

      {notifications.error ? <ErrorState message="We couldn't load your notifications." onRetry={() => void notifications.refetch()} /> : null}

      {rows.length ? (
        <div className="space-y-2">
          {rows.map((notification) => (
            <Card key={notification.id} className={cn(!notification.readAt && "border-primary/40")}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!notification.readAt ? <span className="size-2 rounded-full bg-primary" aria-label="Unread" /> : null}
                    <p className="font-medium">{notification.title}</p>
                    <Badge tone={NOTIFICATION_TONE[notification.severity]}>{notification.severity}</Badge>
                    <Badge tone="muted">{notification.kind.replace(/-/g, " ")}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(notification.createdAt)}>
                    {fromNow(notification.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {notification.actionHref ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={notification.actionHref.replace(/^\/patient/, "/app")}>
                        {notification.actionLabel ?? "Open"}
                      </Link>
                    </Button>
                  ) : null}
                  {!notification.readAt ? (
                    <Button variant="ghost" size="sm" onClick={() => markRead.mutate(notification.id)} loading={markRead.isPending}>
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No notifications"
          description="Appointment reminders, medication prompts and report notices will appear here."
          icon={<Bell className="size-5" />}
        />
      )}
    </div>
  );
}
