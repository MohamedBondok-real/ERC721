import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DoctorProfile, PatientProfile, Role } from "@breastcare/shared";
import { api, tokenStore, ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  walletAddress: string | null;
  pseudonymousId: string | null;
}

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
  patientId: string | null;
  doctorId: string | null;
}

interface ProfileResponse {
  user: SessionUser;
  patient: PatientProfile | null;
  doctor: DoctorProfile | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  patient: PatientProfile | null;
  doctor: DoctorProfile | null;
  patientId: string | null;
  doctorId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  loginWithWallet: (address: string, message: string, signature: string) => Promise<SessionUser>;
  register: (payload: RegisterPayload) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}

export interface RegisterPayload {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  role: "patient" | "doctor";
  birthYear?: number;
  acceptedDisclaimer: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(tokenStore.get()));

  const applySession = useCallback((session: LoginResponse) => {
    tokenStore.set(session.token);
    setUser(session.user);
    queryClient.setQueryData(["auth", "ids"], { patientId: session.patientId, doctorId: session.doctorId });
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setPatient(null);
      setDoctor(null);
      return;
    }
    try {
      const profile = await api.get<ProfileResponse>("/auth/me");
      setUser(profile.user);
      setPatient(profile.patient);
      setDoctor(profile.doctor);
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        tokenStore.clear();
        queryClient.clear();
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await refresh();
      if (active) setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.post<LoginResponse>("/auth/login", { email, password });
      applySession(session);
      await refresh();
      return session.user;
    },
    [applySession, refresh],
  );

  const loginWithWallet = useCallback(
    async (address: string, message: string, signature: string) => {
      const session = await api.post<LoginResponse>("/auth/wallet/login", { address, message, signature });
      applySession(session);
      await refresh();
      return session.user;
    },
    [applySession, refresh],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const session = await api.post<LoginResponse>("/auth/register", payload);
      applySession(session);
      await refresh();
      return session.user;
    },
    [applySession, refresh],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    queryClient.clear();
    setUser(null);
    setPatient(null);
    setDoctor(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      patient,
      doctor,
      patientId: patient?.id ?? null,
      doctorId: doctor?.id ?? null,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      loginWithWallet,
      register,
      logout,
      refresh,
    }),
    [user, patient, doctor, isLoading, login, loginWithWallet, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Convenience guard for route protection. */
export function useRequiredRole(...roles: Role[]): boolean {
  const { user } = useAuth();
  return Boolean(user && roles.includes(user.role));
}
