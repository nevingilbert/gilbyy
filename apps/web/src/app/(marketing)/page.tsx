"use client";

import { useActionState } from "react";
import { sendMagicLink } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(sendMagicLink, undefined);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-emerald-950 p-4">
      <h1 className="mb-1 text-5xl font-bold tracking-tight text-amber-300">
        gilbyy
      </h1>
      <p className="mb-8 text-sm text-emerald-400">a growing collection of small apps</p>

      <div className="w-full max-w-sm rounded-2xl border border-emerald-800 bg-emerald-900/40 p-8">
        {state?.success ? (
          <div className="text-center">
            <p className="text-lg font-semibold text-amber-300">Check your email</p>
            <p className="mt-2 text-sm text-emerald-300">
              We sent a magic link. Click it to enter.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-6 text-center text-lg font-semibold text-white">
              Sign in
            </h2>
            <form action={action} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-xs font-medium text-emerald-300 uppercase tracking-wide">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white placeholder-emerald-600 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
              </div>

              {state?.error && (
                <p className="text-sm text-red-400">{state.error}</p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="mt-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-amber-300 disabled:opacity-60 transition-colors"
              >
                {pending ? "Sending…" : "Send magic link"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
