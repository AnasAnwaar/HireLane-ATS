"use client";

import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDemoAccountAction } from "@/server/platform/org-actions";

export function DemoForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ email: string; password: string } | null>(null);

  function gen() {
    // Readable random password: Demo-XXXXX-XXXX (no ambiguous chars).
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const pick = (n: number) =>
      Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    setPassword(`Demo-${pick(5)}-${pick(4)}`);
  }

  async function submit() {
    setBusy(true);
    const r = await createDemoAccountAction({ email, password, companyName, fullName });
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Demo account created.");
      setCreated({ email, password });
      setEmail("");
      setPassword("");
      setCompanyName("");
      setFullName("");
    } else toast.error(r.error);
  }

  async function copyCreds() {
    if (!created) return;
    await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
    toast.success("Credentials copied.");
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <Field label="Workspace name">
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Demo" />
        </Field>
        <Field label="User's full name (optional)">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" />
        </Field>
        <Field label="Temporary password">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
            <Button type="button" variant="outline" onClick={gen}>
              Generate
            </Button>
          </div>
        </Field>
        <Button
          disabled={busy || !email.trim() || password.length < 8 || !companyName.trim()}
          onClick={submit}
        >
          {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Create demo account
        </Button>
      </Card>

      {created && (
        <Card className="space-y-2 border-success/30 bg-success-soft/40 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            <Check className="size-4" /> Account created — share these credentials
          </div>
          <p className="font-mono text-sm">
            {created.email}
            <br />
            {created.password}
          </p>
          <p className="text-xs text-muted-foreground">
            The workspace + demo plan finish provisioning on their first sign-in, then it appears
            under Organizations.
          </p>
          <Button variant="outline" size="sm" onClick={copyCreds}>
            <Copy /> Copy credentials
          </Button>
        </Card>
      )}
    </div>
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
