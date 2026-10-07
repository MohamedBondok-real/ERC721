import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, ChevronsUpDown, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import { DEMO_DATA_BANNER } from "@breastcare/shared";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { navigationFor } from "@/lib/navigation";
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/Overlay";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const groups = navigationFor(user?.role);

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5 scrollbar-thin">
      <Link to="/" className="flex items-center gap-2.5 px-2" onClick={onNavigate}>
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
            <path d="M16 27s-9-5.4-9-11.7A5.2 5.2 0 0 1 16 11.4a5.2 5.2 0 0 1 9 3.9C25 21.6 16 27 16 27Z" fill="currentColor" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-tight text-sidebar-foreground">BreastCare AI</span>
          <span className="block text-[11px] text-sidebar-foreground/60">Clinical decision support</span>
        </span>
      </Link>

      {groups.map((group) => (
        <div key={group.section} className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">{group.section}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.to} className="space-y-0.5">
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary/15 font-medium text-primary"
                        : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
                {item.children ? (
                  <div className="ml-5 space-y-0.5 border-l border-sidebar-foreground/15 pl-2">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={onNavigate}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                              isActive ? "text-primary" : "text-sidebar-foreground/65 hover:text-sidebar-foreground",
                            )
                          }
                        >
                          <ChildIcon className="size-3.5 shrink-0" />
                          <span className="truncate">{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      <div className="mt-auto rounded-md border border-sidebar-foreground/15 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-sidebar-foreground/60">
        <p className="font-medium text-sidebar-foreground/80">Educational platform</p>
        <p className="mt-1">BreastCare AI does not provide a medical diagnosis and never replaces a qualified healthcare professional.</p>
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, patient } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => api.get<{ notifications: NotificationRow[]; unread: number }>("/notifications", undefined, signal),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center gap-2 bg-warning/10 px-4 py-1.5 text-center text-[11px] font-medium text-warning">
        {DEMO_DATA_BANNER}
      </div>

      {/* Sidebar — fixed on desktop, sheet on mobile */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-foreground/10 bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-foreground/10 bg-sidebar">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <X className="size-4 text-sidebar-foreground" />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>

            <div className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground sm:flex">
              <span className="truncate">{user?.role === "admin" ? "Administration" : user?.role === "doctor" ? "Clinician workspace" : "My care"}</span>
              {patient?.pseudonymousId ? <Badge tone="muted">{patient.pseudonymousId}</Badge> : null}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/app/notifications")}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                className="relative"
              >
                <Bell className="size-4" />
                {unread > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Button>

              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent">
                    <Avatar name={user?.displayName ?? "User"} className="size-8" />
                    <span className="hidden min-w-0 text-left sm:block">
                      <span className="block max-w-[140px] truncate text-sm font-medium">{user?.displayName}</span>
                      <span className="block text-[11px] capitalize text-muted-foreground">{user?.role}</span>
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => navigate("/app/settings")}>
                    <ChevronsUpDown className="size-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate("/app/consent")}>
                    <Search className="size-4" /> Consent & access
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    onSelect={() => {
                      logout();
                      navigate("/login");
                    }}
                  >
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="clinical-shell py-6 lg:py-8">{children}</main>

        <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
          <p>BreastCare AI is an educational and clinical decision-support platform. It does not provide a medical diagnosis or replace a qualified healthcare professional.</p>
        </footer>
      </div>
    </div>
  );
}
