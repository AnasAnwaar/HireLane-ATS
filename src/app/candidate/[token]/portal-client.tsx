"use client";

import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  updateOwnProfileAction,
  uploadOwnCvAction,
  withdrawAction,
} from "@/server/candidates/candidate-self-actions";

type Profile = {
  phone: string | null;
  location: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
};

export function PortalClient({
  token,
  hasCv,
  profile,
  canWithdraw,
}: {
  token: string;
  hasCv: boolean;
  profile: Profile;
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [cvDone, setCvDone] = React.useState(hasCv);

  async function saveProfile(formData: FormData) {
    setSavingProfile(true);
    const result = await updateOwnProfileAction(token, null, formData);
    setSavingProfile(false);
    if (result.ok) {
      toast.success("Saved.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function uploadCv(formData: FormData) {
    setUploading(true);
    const result = await uploadOwnCvAction(token, null, formData);
    setUploading(false);
    if (result.ok) {
      toast.success("CV uploaded.");
      setCvDone(true);
      setFileName(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function withdraw() {
    const ok = await confirm({
      title: "Withdraw your application?",
      description: "This can't be undone. The employer will no longer consider you for this role.",
      confirmLabel: "Withdraw",
      tone: "destructive",
    });
    if (!ok) return;
    const result = await withdrawAction(token);
    if (result.ok) {
      toast.success(result.message ?? "Withdrawn.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      {/* Profile completion */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Your details</h2>
        <form
          action={saveProfile}
          className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-card"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="headline" label="Current title">
              <Input name="headline" defaultValue={profile.headline ?? ""} />
            </Field>
            <Field id="phone" label="Phone">
              <Input name="phone" type="tel" defaultValue={profile.phone ?? ""} />
            </Field>
            <Field id="location" label="Location">
              <Input name="location" defaultValue={profile.location ?? ""} />
            </Field>
            <Field id="linkedinUrl" label="LinkedIn">
              <Input name="linkedinUrl" defaultValue={profile.linkedinUrl ?? ""} />
            </Field>
            <Field id="portfolioUrl" label="Portfolio">
              <Input name="portfolioUrl" defaultValue={profile.portfolioUrl ?? ""} />
            </Field>
            <Field id="githubUrl" label="GitHub">
              <Input name="githubUrl" defaultValue={profile.githubUrl ?? ""} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile && <Loader2 className="animate-spin" />}
              Save details
            </Button>
          </div>
        </form>
      </section>

      {/* CV */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">CV / Résumé</h2>
        <form
          action={uploadCv}
          className="rounded-xl border border-border bg-card p-5 shadow-card"
        >
          {cvDone && (
            <Alert variant="success" className="mb-3">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> We have your CV on file. Upload again to replace it.
              </span>
            </Alert>
          )}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm transition-colors hover:border-primary/40">
            <Upload className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">
              {fileName ?? "Choose a PDF or Word file…"}
            </span>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">Browse</span>
            <input
              type="file"
              name="cv"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </label>
          {fileName && (
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={uploading}>
                {uploading && <Loader2 className="animate-spin" />}
                Upload CV
              </Button>
            </div>
          )}
        </form>
      </section>

      {/* Withdraw */}
      {canWithdraw && (
        <section className="mt-8 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            No longer interested?{" "}
            <button
              onClick={withdraw}
              className="font-medium text-destructive underline-offset-4 hover:underline"
            >
              Withdraw your application
            </button>
          </p>
        </section>
      )}
    </>
  );
}
