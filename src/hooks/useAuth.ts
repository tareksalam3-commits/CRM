import { useState, useEffect, useCallback } from 'react';
import { supabase, type User } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (authId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();
    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }
    return data as User | null;
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) {
        setAuthUser({ id: session.user.id, email: session.user.email || '' });
        const u = await fetchUser(session.user.id);
        if (mounted) setUser(u);
      }
      if (mounted) setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUser({ id: session.user.id, email: session.user.email || '' });
        fetchUser(session.user.id).then((u) => {
          if (mounted) setUser(u);
        });
      } else {
        setAuthUser(null);
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUser]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      setAuthUser({ id: data.user.id, email: data.user.email || '' });
      const u = await fetchUser(data.user.id);
      setUser(u);
    }
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setUser(null);
  };

  return { user, authUser, loading, signIn, signOut };
}
