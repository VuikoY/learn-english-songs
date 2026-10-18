"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { migrateGuestData } from "@/lib/storage/migrateGuestData";

type AuthState = { userId: string | null; loading: boolean };
const AuthContext = createContext<AuthState>({ userId: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, loading: true });
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() => setState({ userId: null, loading: false }));
      return;
    }
    const supabase = client;
    let active = true;
    let authEventReceived = false;
    async function setSession(session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) {
      const userId = session?.user.is_anonymous ? null : session?.user.id ?? null;
      if (userId) {
        setState((previous) => ({ userId: previous.userId, loading: true }));
        await migrateGuestData(userId, supabase);
      }
      if (active) setState({ userId, loading: false });
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      authEventReceived = true;
      if (!active) return;
      if (session?.user && !session.user.is_anonymous && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
        // Run storage and database work after the auth callback has returned.
        queueMicrotask(() => { void setSession(session); });
      } else {
        void setSession(session);
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active && !authEventReceived) void setSession(data.session);
    }).catch(() => { if (active) setState({ userId: null, loading: false }); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuthState() { return useContext(AuthContext); }
