import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, created in the browser only, and only when the project's URL
 * and publishable key are configured. Without them the game is single-player and
 * nothing here is ever called. See docs/decisions/0007-accounts-multiplayer-and-a-shop.md.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const onlineConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!onlineConfigured || typeof window === "undefined") return null;
  client ??= createClient(URL!, KEY!, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } });
  return client;
}

export async function currentSession(): Promise<Session | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** Calls back with the session whenever it changes (sign-in, sign-out, token refresh). */
export function onSessionChange(cb: (session: Session | null) => void) {
  const sb = supabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

const back = () => window.location.origin + window.location.pathname;

export async function signInWithGoogle() {
  const { error } = await supabase()!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } });
  return error?.message ?? null;
}

export async function signOut() {
  await supabase()?.auth.signOut();
}
