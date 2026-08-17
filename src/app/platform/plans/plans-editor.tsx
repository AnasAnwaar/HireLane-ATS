"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Plan } from "@/types/database";
import {
  createPlanAction,
  type PlanPatch,
  syncPlanStripeAction,
  updatePlanAction,
} from "@/server/platform/plan-actions";

const FEATURES = [
  { key: "feat_integrations", label: "Integrations" },
  { key: "feat_ai_posts", label: "AI posts" },
  { key: "feat_ai_screening", label: "AI screening" },
  { key: "feat_ai_assessments", label: "AI assessments" },
] as const;

type Draft = {
  name: string;
  monthly: string; // dollars
  perSeat: string;
  seatCap: string; // "" = unlimited
  openingCap: string;
  sortOrder: string;
  isPublic: boolean;
  allowAddon: boolean;
  feat_integrations: boolean;
  feat_ai_posts: boolean;
  feat_ai_screening: boolean;
  feat_ai_assessments: boolean;
};

function toDraft(p: Plan): Draft {
  return {
    name: p.name,
    monthly: (p.monthly_cents / 100).toString(),
    perSeat: (p.per_seat_cents / 100).toString(),
    seatCap: p.seat_cap == null ? "" : String(p.seat_cap),
    openingCap: p.opening_cap == null ? "" : String(p.opening_cap),
    sortOrder: String(p.sort_order),
    isPublic: p.is_public,
    allowAddon: p.allow_addon_seats,
    feat_integrations: p.feat_integrations,
    feat_ai_posts: p.feat_ai_posts,
    feat_ai_screening: p.feat_ai_screening,
    feat_ai_assessments: p.feat_ai_assessments,
  };
}

function draftToPatch(d: Draft): PlanPatch {
  const capOf = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))));
  return {
    name: d.name,
    monthly_cents: Math.max(0, Math.round(Number(d.monthly || 0) * 100)),
    per_seat_cents: Math.max(0, Math.round(Number(d.perSeat || 0) * 100)),
    seat_cap: capOf(d.seatCap),
    opening_cap: capOf(d.openingCap),
    sort_order: Math.max(0, Math.round(Number(d.sortOrder || 0))),
    is_public: d.isPublic,
    allow_addon_seats: d.allowAddon,
    feat_integrations: d.feat_integrations,
    feat_ai_posts: d.feat_ai_posts,
    feat_ai_screening: d.feat_ai_screening,
    feat_ai_assessments: d.feat_ai_assessments,
  };
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  );
}

export function PlansEditor({ plans, stripeEnabled }: { plans: Plan[]; stripeEnabled: boolean }) {
  return (
    <div className="space-y-5">
      {plans.map((p) => (
        <PlanCard key={p.key} plan={p} stripeEnabled={stripeEnabled} />
      ))}
      <NewPlan />
    </div>
  );
}

function PlanCard({ plan, stripeEnabled }: { plan: Plan; stripeEnabled: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(plan));
  const [saved, setSaved] = React.useState<Draft>(() => toDraft(plan));
  const [busy, setBusy] = React.useState<null | "save" | "stripe">(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setBusy("save");
    const r = await updatePlanAction(plan.key, draftToPatch(draft));
    setBusy(null);
    if (r.ok) {
      setSaved(draft);
      toast.success(r.message ?? "Saved.");
      router.refresh();
    } else toast.error(r.error);
  }

  async function sync() {
    setBusy("stripe");
    const r = await syncPlanStripeAction(plan.key);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Synced.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{plan.key}</h3>
        {!draft.isPublic && <Badge variant="secondary">Private</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {plan.stripe_price_id ? `stripe: ${plan.stripe_price_id.slice(0, 14)}…` : "no stripe price"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Monthly ($)">
          <Input type="number" min={0} value={draft.monthly} onChange={(e) => set("monthly", e.target.value)} />
        </Field>
        <Field label="Per extra seat ($)">
          <Input type="number" min={0} value={draft.perSeat} onChange={(e) => set("perSeat", e.target.value)} />
        </Field>
        <Field label="Seat cap (blank = ∞)">
          <Input type="number" min={0} value={draft.seatCap} onChange={(e) => set("seatCap", e.target.value)} />
        </Field>
        <Field label="Opening cap (blank = ∞)">
          <Input type="number" min={0} value={draft.openingCap} onChange={(e) => set("openingCap", e.target.value)} />
        </Field>
        <Field label="Sort order">
          <Input type="number" min={0} value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Check checked={draft.isPublic} onChange={(v) => set("isPublic", v)} label="Public (listed on pricing)" />
        <Check checked={draft.allowAddon} onChange={(v) => set("allowAddon", v)} label="Allow add-on seats" />
        {FEATURES.map((f) => (
          <Check key={f.key} checked={draft[f.key]} onChange={(v) => set(f.key, v)} label={f.label} />
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button disabled={!dirty || busy !== null} onClick={save}>
          {busy === "save" && <Loader2 className="animate-spin" />}
          {dirty ? "Save changes" : "Saved"}
        </Button>
        {stripeEnabled && Number(draft.monthly) > 0 && (
          <Button variant="outline" disabled={busy !== null} onClick={sync}>
            {busy === "stripe" && <Loader2 className="animate-spin" />}
            Sync price to Stripe
          </Button>
        )}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NewPlan() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    setBusy(true);
    const r = await createPlanAction({ key, name, is_public: false, sort_order: 100 });
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Created.");
      setKey("");
      setName("");
      setOpen(false);
      router.refresh();
    } else toast.error(r.error);
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus /> New plan
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">New plan</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Creates a private plan (edit its limits/features/pricing above after creating).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Key (slug)">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="acme-enterprise" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Enterprise" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button disabled={busy || !key.trim() || !name.trim()} onClick={create}>
          {busy && <Loader2 className="animate-spin" />}
          Create plan
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
