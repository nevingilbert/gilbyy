import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, created in the browser only, and only when the project's URL
 * and publishable key are configured. Without them the game is single-player and
 * nothing here is ever called. See docs/decisions/0007-accounts-multiplayer-and-a-shop.md.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const onlineConfigured = Boolean(URL && KEY);

/**
 * A header that asks for a request to be sent with fetch's `keepalive`, so it gets there
 * even if the page goes first: the bank made as a tab hides or closes (store.ts). Taken off
 * again here before the request goes, so the server never sees it. Only for that bank, as
 * a page may have no more than 64 KB of keepalive bodies in flight.
 */
export const KEEPALIVE = "x-gilbyy-keepalive";

/**
 * The client's fetch: the browser's, with a request marked `KEEPALIVE` kept alive past the
 * page. Supabase is another origin and its requests carry an apikey and a token, so each
 * needs a CORS preflight. Chrome has kept such a request alive since its CORS checks moved
 * out of the page (79, early 2020), Firefox since it took up keepalive (133), and Safari
 * keeps it in the network process that does its CORS checks. An older Chrome refused one,
 * as any browser refuses one past the 64 KB: refused, it goes the ordinary way, as it
 * always did.
 */
export async function keepingAlive(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has(KEEPALIVE)) return fetch(input, init);
  headers.delete(KEEPALIVE);
  try {
    return await fetch(input, { ...init, headers, keepalive: true });
  } catch (e) {
    // Stopped on purpose is an answer; anything else may be the keepalive the browser wouldn't take.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return fetch(input, { ...init, headers });
  }
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!onlineConfigured || typeof window === "undefined") return null;
  client ??= createClient(URL!, KEY!, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
    global: { fetch: keepingAlive },
  });
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
