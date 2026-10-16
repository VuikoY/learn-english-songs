"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (active) setState({ userId: session?.user.is_anonymous ? null : session?.user.id ?? null, loading: false });
    });
    void client.auth.getSession().then(({ data }) => {
      if (active && !authEventReceived) setState({ userId: data.session?.user.is_anonymous ? null : data.session?.user.id ?? null, loading: false });
    }).catch(() => { if (active) setState({ userId: null, loading: false }); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuthState() { return useContext(AuthContext); }
