import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
};

const toAuthUser = (u: User | null | undefined): AuthUser | null =>
  u
    ? {
        id: u.id,
        email: u.email ?? null,
        name: (u.user_metadata?.full_name as string | undefined) ?? (u.user_metadata?.name as string | undefined) ?? null,
      }
    : null;

// Session state from Lovable Cloud auth; replaces the Manus OAuth/tRPC hook.
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } = options ?? {};
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session?.user));
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(toAuthUser(data.session?.user));
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || user) return;
    if (window.location.pathname === redirectPath) return;
    window.location.href = redirectPath;
  }, [redirectOnUnauthenticated, redirectPath, loading, user]);

  const refresh = useCallback(async () => {
    const { data, error: e } = await supabase.auth.getUser();
    if (e) setError(e);
    setUser(toAuthUser(data.user));
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return { user, loading, error, isAuthenticated: Boolean(user), refresh, logout };
}
