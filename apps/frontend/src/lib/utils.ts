import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatDate(value: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!value) return "—";
  const date = new Date(value);
  return isValid(date) ? format(date, pattern) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, "d MMM yyyy, HH:mm");
}

export function formatTime(value: string | null | undefined): string {
  return formatDate(value, "HH:mm");
}

export function fromNow(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : "—";
}

export function relativeDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseISO(value);
  if (!isValid(date)) return "—";
  const today = new Date();
  const days = Math.round((date.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return formatDate(value, "EEE d MMM");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function shortHash(hash: string | null | undefined, size = 10): string {
  if (!hash) return "—";
  return hash.length > size * 2 + 2 ? `${hash.slice(0, size)}…${hash.slice(-6)}` : hash;
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Stable, deterministic colour for a category label — used by charts and badges. */
export function categoryColour(label: string): string {
  const palette = ["#0f766e", "#0e7490", "#4338ca", "#7c3aed", "#b45309", "#be123c", "#15803d", "#475569"];
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return palette[hash % palette.length]!;
}
