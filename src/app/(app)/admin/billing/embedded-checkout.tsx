"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { createEmbeddedCheckoutSessionAction } from "@/server/billing/actions";

// Publishable key is safe to expose; loadStripe is memoized outside render.
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

/**
 * Stripe Embedded Checkout in a modal — the card form renders inside our app
 * (no redirect to checkout.stripe.com). On completion Stripe navigates the page
 * to the session's return_url (…/admin/billing?checkout=complete).
 */
export function EmbeddedCheckoutModal({ planKey, onClose }: { planKey: string; onClose: () => void }) {
  const fetchClientSecret = React.useCallback(async () => {
    const r = await createEmbeddedCheckoutSessionAction(planKey);
    if (!r.ok) {
      toast.error(r.error);
      onClose();
      return "";
    }
    return r.clientSecret;
  }, [planKey, onClose]);

  // Lock body scroll + close on Escape.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70"
        >
          <X className="size-4" />
        </button>
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
