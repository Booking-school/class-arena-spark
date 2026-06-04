import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "teacher" | "student" | "guest";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const RESTORE_ATTEMPTS_WITH_STORED_SESSION = 10;
const RESTORE_DELAY_MS = 300;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasStoredAuthSession() {
  if (typeof window === "undefined") return false;
  try {
    return Object.keys(window.localStorage).some((key) => {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) return false;
      return window.localStorage.getItem(key)?.includes("refresh_token") ?? false;
    });
  } catch {
    return false;
  }
}

async function restoreSessionWithGrace() {
  const attempts = hasStoredAuthSession() ? RESTORE_ATTEMPTS_WITH_STORED_SESSION : 1;
  for (let i = 0; i < attempts; i += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    if (i < attempts - 1) await delay(RESTORE_DELAY_MS);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const finishLoadingForUser = (userId: string) => {
      if (!mounted || activeUserIdRef.current !== userId) return;
      setLoading(false);
    };

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      const nextUser = nextSession?.user ?? null;
      const previousUserId = activeUserIdRef.current;
      const nextUserId = nextUser?.id ?? null;
      activeUserIdRef.current = nextUser?.id ?? null;
      setSession(nextSession);
      setUser(nextUser);
      if (nextUserId && previousUserId === nextUserId) return;
      if (nextUser) {
        setLoading(true);
        setRoles([]);
        setTimeout(() => {
          fetchRoles(nextUser.id).finally(() => finishLoadingForUser(nextUser.id));
        }, 0);
      } else {
        setRoles([]);
        setLoading(false);
      }
    };

    // Listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });

    // THEN restore existing session. Some school devices restore localStorage
    // slowly after a hard refresh, so give persisted sessions a short grace window.
    restoreSessionWithGrace()
      .then((restoredSession) => applySession(restoredSession))
      .catch(() => applySession(null))
      .finally(() => {
        if (mounted && !activeUserIdRef.current) setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function fetchRoles(userId: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (activeUserIdRef.current !== userId) return;
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }

  const value: AuthContextValue = {
    user,
    session,
    roles,
    loading,
    hasRole: (role) => roles.includes(role),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
