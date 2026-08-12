"use client";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/validation/auth";
import { submitContactAction } from "@/server/marketing/contact-actions";

const field =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

export function ContactForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    submitContactAction,
    null,
  );
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (state?.ok) {
    return (
      <div className="hairline flex flex-col items-center rounded-2xl border border-primary/25 bg-white/[0.03] px-8 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15">
          <CheckCircle2 className="size-7 text-primary" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-white">Message sent</h3>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          Thanks for reaching out — we&rsquo;ll get back to you at the email you provided shortly.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="hairline rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      {state && !state.ok && !Object.keys(fe).length && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          {state.error}
        </p>
      )}

      {/* Honeypot — hidden from humans */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-300">Name</span>
          <input name="name" required placeholder="Your name" className={field} />
          {fe.name && <span className="mt-1 block text-xs text-primary">{fe.name}</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-300">Email</span>
          <input name="email" type="email" required placeholder="you@company.com" className={field} />
          {fe.email && <span className="mt-1 block text-xs text-primary">{fe.email}</span>}
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm text-zinc-300">Subject <span className="text-zinc-500">(optional)</span></span>
        <input name="subject" placeholder="What's this about?" className={field} />
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm text-zinc-300">Message</span>
        <textarea name="message" required rows={5} placeholder="How can we help?" className={field} />
        {fe.message && <span className="mt-1 block text-xs text-primary">{fe.message}</span>}
      </label>

      <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Send message
      </Button>
    </form>
  );
}
