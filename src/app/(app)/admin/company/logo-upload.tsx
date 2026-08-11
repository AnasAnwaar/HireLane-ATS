"use client";

import { Building2, ImageUp, Loader2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const BUCKET = "org-branding";
const ACCEPT = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

/**
 * Company logo upload. Uploads straight to the public `org-branding` bucket from
 * the browser (the storage RLS insert policy checks manage_company_profile + org
 * folder), then reports the public URL up. The parent persists that URL with the
 * rest of the company form.
 */
export function LogoUpload({
  orgId,
  value,
  onChange,
  disabled,
}: {
  orgId: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  async function upload(file: File) {
    if (!ACCEPT.includes(file.type)) {
      toast.error("Use a PNG, JPG or SVG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Keep the logo under 2 MB.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const path = `${orgId}/logo-${Date.now()}.${EXT[file.type] ?? "png"}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setBusy(false);
      toast.error(error.message || "Upload failed.");
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setBusy(false);
    onChange(data.publicUrl);
    toast.success("Logo uploaded.");
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  // Paste an image from the clipboard (copy an image anywhere → Ctrl/Cmd+V).
  const uploadRef = React.useRef(upload);
  React.useEffect(() => {
    uploadRef.current = upload;
  });
  React.useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (disabled) return;
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (it) => it.kind === "file" && it.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void uploadRef.current(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled]);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) onFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex items-center gap-4 rounded-lg border border-dashed p-4 transition-colors",
          dragging ? "border-primary bg-primary-soft/40" : "border-border",
          disabled && "opacity-60",
        )}
      >
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Logo" className="size-full object-contain p-1" />
          ) : (
            <Building2 className="size-6 text-muted-foreground" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{value ? "Logo uploaded" : "Upload a logo"}</p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG or SVG · up to 2 MB · drag &amp; drop, paste, or browse
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {value && !busy && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} disabled={disabled}>
              <X /> Remove
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
            {value ? "Replace" : "Upload"}
          </Button>
        </div>
      </div>

      {/* Persisted with the rest of the form. */}
      <input type="hidden" name="logo_url" value={value} />
    </div>
  );
}
