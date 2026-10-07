import type { Role } from "@breastcare/shared";
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  Link2,
  Pill,
  Salad,
  Settings,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  roles: Role[];
  section: string;
  children?: { to: string; label: string; icon: LucideIcon }[];
}

/**
 * The complete navigation tree. Sections are grouped so the sidebar stays scannable for
 * clinicians, and every route is role-gated at both the nav and the route level.
 */
export const NAVIGATION: NavItem[] = [
  {
    to: "/app/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["patient", "doctor", "admin"],
    section: "Overview",
  },
  {
    to: "/app/patients",
    label: "Patients",
    icon: Users,
    roles: ["doctor", "admin"],
    section: "Overview",
    description: "Only patients who granted you consent appear here.",
  },
  {
    to: "/app/risk-assessment",
    label: "Risk Assessment",
    icon: Activity,
    roles: ["patient", "doctor", "admin"],
    section: "Clinical",
    description: "Educational risk indicator — never a diagnosis.",
  },
  {
    to: "/app/symptoms",
    label: "Symptoms",
    icon: Stethoscope,
    roles: ["patient", "doctor", "admin"],
    section: "Clinical",
  },
  {
    to: "/app/nutrition",
    label: "Nutrition",
    icon: Salad,
    roles: ["patient", "doctor", "admin"],
    section: "Clinical",
    children: [
      { to: "/app/nutrition/during-treatment", label: "During Treatment", icon: Syringe },
      { to: "/app/nutrition/recovery", label: "Recovery", icon: Activity },
      { to: "/app/nutrition/survivorship", label: "Survivorship", icon: ShieldCheck },
      { to: "/app/nutrition/side-effects", label: "Side-Effect Support", icon: Pill },
    ],
  },
  {
    to: "/app/treatments",
    label: "Treatments",
    icon: Pill,
    roles: ["patient", "doctor", "admin"],
    section: "Clinical",
    children: [
      { to: "/app/treatments/plans", label: "Treatment Plans", icon: ClipboardList },
      { to: "/app/treatments/medications", label: "Medications", icon: Pill },
      { to: "/app/treatments/appointments", label: "Appointments", icon: CalendarDays },
    ],
  },
  {
    to: "/app/records",
    label: "Medical Records",
    icon: FileText,
    roles: ["patient", "doctor", "admin"],
    section: "Records",
  },
  {
    to: "/app/reports",
    label: "Reports",
    icon: ClipboardList,
    roles: ["patient", "doctor", "admin"],
    section: "Records",
  },
  {
    to: "/app/appointments",
    label: "Appointments",
    icon: CalendarDays,
    roles: ["patient", "doctor", "admin"],
    section: "Records",
  },
  {
    to: "/app/consent",
    label: "Consent & Access",
    icon: ShieldCheck,
    roles: ["patient", "doctor", "admin"],
    section: "Trust",
  },
  {
    to: "/app/blockchain",
    label: "Blockchain",
    icon: Link2,
    roles: ["patient", "doctor", "admin"],
    section: "Trust",
  },
  {
    to: "/app/assistant",
    label: "AI Assistant",
    icon: Bot,
    roles: ["patient", "doctor", "admin"],
    section: "Support",
  },
  {
    to: "/app/knowledge",
    label: "Knowledge Center",
    icon: BookOpen,
    roles: ["patient", "doctor", "admin"],
    section: "Support",
  },
  {
    to: "/app/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["patient", "doctor", "admin"],
    section: "Support",
  },
  {
    to: "/app/admin",
    label: "Administration",
    icon: Gauge,
    roles: ["admin"],
    section: "Support",
  },
  {
    to: "/app/settings",
    label: "Settings",
    icon: Settings,
    roles: ["patient", "doctor", "admin"],
    section: "Support",
  },
];

export const NAV_SECTIONS = ["Overview", "Clinical", "Records", "Trust", "Support"] as const;

export function navigationFor(role: Role | undefined): { section: string; items: NavItem[] }[] {
  if (!role) return [];
  return NAV_SECTIONS.map((section) => ({
    section,
    items: NAVIGATION.filter((item) => item.section === section && item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function homePathFor(role: Role | undefined): string {
  if (role === "admin") return "/app/admin";
  if (role === "doctor") return "/app/dashboard";
  return "/app/dashboard";
}
