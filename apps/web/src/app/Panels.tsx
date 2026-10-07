"use client";

import { useEffect, useState } from "react";
import { fmtMiles } from "./GarageMenu";
import { foundLine } from "./places";
import type { Standing } from "./store";
import { STARTERS, type VehicleId } from "./vehicles";

const panel =
  "pointer-events-auto rounded-2xl border border-white/10 bg-[rgba(24,20,17,0.8)] p-5 text-[rgba(255,246,232,0.86)] shadow-2xl backdrop-blur-md";
const button =
  "rounded-full border border-white/20 px-4 py-1.5 text-sm text-[rgba(255,246,232,0.9)] transition-colors hover:bg-white/10 disabled:opacity-40";
const field =
  "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[rgba(255,246,232,0.95)] outline-none placeholder:text-[rgba(255,246,232,0.35)] focus:border-white/35";

/** Choosing your first rig. The truck at your tent changes as you look through them. */
export function StarterPicker({ onLook, onPick }: { onLook: (id: VehicleId) => void; onPick: (id: VehicleId) => void }) {
  const [i, setI] = useState(0);
  const v = STARTERS[i];

  useEffect(() => onLook(v.id), [v.id, onLook]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") setI((n) => (n + STARTERS.length - 1) % STARTERS.length);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") setI((n) => (n + 1) % STARTERS.length);
      else if (e.key === "Enter" || e.key === " ") onPick(v.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v.id, onPick]);

  return (
    <div className="absolute inset-x-0 bottom-6 flex justify-center px-3">
      <div className={`${panel} w-full max-w-md text-center`}>
        <p className="text-xs uppercase tracking-[0.18em] text-[rgba(255,246,232,0.5)]">Pick a rig to start with</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button aria-label="Previous" className={button} onClick={() => setI((n) => (n + STARTERS.length - 1) % STARTERS.length)}>
            ◀
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight">{v.name}</h2>
            <p className="mt-1 text-sm text-[rgba(255,246,232,0.6)]">{v.blurb}</p>
          </div>
          <button aria-label="Next" className={button} onClick={() => setI((n) => (n + 1) % STARTERS.length)}>
            ▶
          </button>
        </div>
        <button className={`${button} mt-4 bg-white/10 px-6`} onClick={() => onPick(v.id)}>
          Drive the {v.name}
        </button>
        <p className="mt-2 text-[11px] text-[rgba(255,246,232,0.4)]">Bigger rigs are for sale at the garages.</p>
      </div>
    </div>
  );
}

/** The one line that says your progress won't keep, and how to make it keep. */
export function SoloBanner({ canSignIn, onSignIn }: { canSignIn: boolean; onSignIn: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return canSignIn ? (
      <button onClick={onSignIn} className="pointer-events-auto absolute right-4 top-4 hidden rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs text-[rgba(255,246,232,0.8)] backdrop-blur sm:block">
        Sign in
      </button>
    ) : null;
  }
  return (
    // On phones it sits under the guidance line, clear of the minimap; centred under the compass otherwise.
    <div className="pointer-events-none absolute left-3 right-[128px] top-[5.5rem] flex sm:inset-x-3 sm:top-14 sm:justify-center">
      <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-white/15 bg-black/30 py-1.5 pl-3 pr-1.5 text-xs text-[rgba(255,246,232,0.82)] backdrop-blur sm:rounded-full sm:pl-4">
        <span>
          <b className="font-semibold">Single player.</b> Nothing is saved when you leave.
          {canSignIn && <span className="hidden sm:inline"> Sign in to keep your miles and drive with friends.</span>}
        </span>
        {canSignIn && (
          <button onClick={onSignIn} className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25">
            Sign in
          </button>
        )}
        <button aria-label="Hide" onClick={() => setOpen(false)} className="shrink-0 rounded-full px-2 py-1 text-[rgba(255,246,232,0.5)] hover:text-[rgba(255,246,232,0.9)]">
          ✕
        </button>
      </div>
    </div>
  );
}

export function SignInPanel({
  onGoogle, onEmail, onClose,
}: {
  onGoogle: () => Promise<string | null>;
  onEmail: (email: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`${panel} w-full max-w-sm`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
        <p className="mt-1 text-sm text-[rgba(255,246,232,0.6)]">
          Your miles and garage are saved, and you share the valley with everyone else signed in. Add friends at the café to
          see each other on the leaderboard and chat.
        </p>
        <button className={`${button} mt-4 w-full bg-white/10 py-2`} onClick={async () => setError(await onGoogle())}>
          Continue with Google
        </button>
        <div className="my-4 flex items-center gap-3 text-[11px] text-[rgba(255,246,232,0.35)]">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>
        {state === "sent" ? (
          <p className="text-sm text-[rgba(255,246,232,0.8)]">Check your email for a sign-in link. Open it in this browser.</p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("sending");
              const err = await onEmail(email.trim());
              setError(err);
              setState(err ? "idle" : "sent");
            }}
          >
            <input className={field} type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className={button} disabled={state === "sending"}>
              Send link
            </button>
          </form>
        )}
        {error && <p className="mt-3 text-xs text-[rgba(255,210,170,0.9)]">{error}</p>}
        <button className="mt-4 text-xs text-[rgba(255,246,232,0.45)] hover:text-[rgba(255,246,232,0.8)]" onClick={onClose}>
          Keep driving solo
        </button>
      </div>
    </div>
  );
}

/** Asked once, after signing in: the name other drivers see over your truck. */
export function NamePanel({ onSave }: { onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <form
        className={`${panel} w-full max-w-sm`}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(await onSave(name));
        }}
      >
        <h2 className="text-lg font-semibold tracking-tight">What should other drivers call you?</h2>
        <p className="mt-1 text-sm text-[rgba(255,246,232,0.6)]">It hangs over your truck and shows on friends&apos; leaderboards.</p>
        <input
          autoFocus
          className={`${field} mt-4`}
          maxLength={20}
          placeholder="3 to 20 letters or numbers"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {error && <p className="mt-2 text-xs text-[rgba(255,210,170,0.9)]">{error}</p>}
        <button className={`${button} mt-4 bg-white/10`}>Save</button>
      </form>
    </div>
  );
}

/** Lifetime miles: yours and your friends'. */
export function Leaderboard({
  online, load, onClose, onSignOut,
}: {
  online: boolean;
  load: () => Promise<Standing[]>;
  onClose: () => void;
  onSignOut?: () => void;
}) {
  const [rows, setRows] = useState<Standing[] | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((r) => live && setRows(r));
    return () => void (live = false);
  }, [load]);
  // The game ignores keys while a panel is up, so the key that opened this has to close it here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat && (e.key === "l" || e.key === "L" || e.key === "Escape")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`${panel} w-full max-w-sm`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Miles driven</h2>
          <span className="text-[11px] text-[rgba(255,246,232,0.4)]">you and your friends</span>
        </div>
        {!online ? (
          <p className="mt-3 text-sm text-[rgba(255,246,232,0.6)]">Sign in and add friends at the café to compare miles.</p>
        ) : rows === null ? (
          <p className="mt-3 text-sm text-[rgba(255,246,232,0.5)]">Looking…</p>
        ) : (
          <ol className="mt-3 space-y-1">
            {rows.map((r, i) => (
              <li key={r.id} className={`flex items-baseline gap-3 rounded-lg px-3 py-1.5 text-sm ${r.me ? "bg-white/[0.08]" : ""}`}>
                <span className="w-5 text-right text-xs text-[rgba(255,246,232,0.45)]">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.name}</span>
                  <span className="block text-[11px] tabular-nums text-[rgba(255,246,232,0.45)]">
                    {foundLine({ garage: r.garages, cafe: r.cafes })} found
                  </span>
                </span>
                <span className="tabular-nums text-[rgba(255,246,232,0.75)]">{fmtMiles(r.lifetime)} mi</span>
              </li>
            ))}
            {rows.length === 1 && (
              <li className="pt-2 text-xs text-[rgba(255,246,232,0.45)]">Meet someone at the café by camp and press F to add them.</li>
            )}
          </ol>
        )}
        <div className="mt-4 flex items-center justify-between">
          {onSignOut ? (
            <button className="text-xs text-[rgba(255,246,232,0.45)] hover:text-[rgba(255,246,232,0.8)]" onClick={onSignOut}>
              Sign out
            </button>
          ) : (
            <span />
          )}
          <button className={button} onClick={onClose}>
            Close <span className="text-[rgba(255,246,232,0.45)]">· L</span>
          </button>
        </div>
      </div>
    </div>
  );
}
