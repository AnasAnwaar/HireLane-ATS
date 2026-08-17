import { requirePlatformAccess } from "@/server/platform/auth";

import { DemoForm } from "./demo-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo accounts · Platform" };

export default async function PlatformDemoPage() {
  await requirePlatformAccess();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Create a demo account</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Provisions a new workspace with the <strong>all-access demo plan</strong> — every feature,
          no limits, no charge. Only you can create these; users can&apos;t self-serve one.
        </p>
      </div>
      <DemoForm />
    </div>
  );
}
