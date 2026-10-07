import { QueryClient } from "@tanstack/react-query";
import { ApiError, tokenStore } from "./api";

export const queryKeys = {
  meta: ["meta"] as const,
  session: ["session"] as const,
  notifications: ["notifications"] as const,
  patient: {
    overview: ["patient", "overview"] as const,
    timeline: ["patient", "timeline"] as const,
    records: ["patient", "records"] as const,
    symptoms: ["patient", "symptoms"] as const,
    risk: ["patient", "risk"] as const,
    nutrition: ["patient", "nutrition"] as const,
    adherence: (days: number) => ["patient", "nutrition", "adherence", days] as const,
    reports: ["patient", "reports"] as const,
    consent: ["patient", "consent"] as const,
    grantees: ["consent", "grantees"] as const,
    access: ["patient", "access"] as const,
    consentStatus: (patientId: string) => ["consent", "status", patientId] as const,
  },
  treatments: (patientId: string) => ["treatments", patientId] as const,
  treatment: (id: string) => ["treatments", id] as const,
  medications: (patientId: string) => ["medications", patientId] as const,
  appointments: (scope: string) => ["appointments", scope] as const,
  availability: (doctorId: string, days: number) => ["availability", doctorId, days] as const,
  doctor: {
    dashboard: ["doctor", "dashboard"] as const,
    patients: (search: string) => ["doctor", "patients", search] as const,
    alerts: ["doctor", "alerts"] as const,
    reports: ["doctor", "reports"] as const,
  },
  analytics: ["analytics"] as const,
  blockchain: (patientId: string | null) => ["blockchain", patientId ?? "me"] as const,
  blockchainHealth: ["blockchain", "health"] as const,
  knowledge: {
    categories: ["knowledge", "categories"] as const,
    articles: (category?: string) => ["knowledge", "articles", category ?? "all"] as const,
    article: (slug: string) => ["knowledge", "article", slug] as const,
  },
  redFlags: ["red-flags"] as const,
  admin: {
    overview: ["admin", "overview"] as const,
    audit: (limit: number, offset: number) => ["admin", "audit", limit, offset] as const,
    blockchainRecords: ["admin", "blockchain-records"] as const,
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Never retry auth or permission failures — they need a user decision, not a retry loop.
        if (error instanceof ApiError && (error.isUnauthorized || error.status === 403)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

/** Clears the session everywhere when the token stops being accepted. */
export function handleSessionExpired(): void {
  tokenStore.clear();
  queryClient.clear();
}
