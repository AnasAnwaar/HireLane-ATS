import { z } from "zod";

/**
 * Environment validation.
 *
 * Two separate schemas because Next.js only inlines `NEXT_PUBLIC_*` into the
 * client bundle. Server vars are read lazily so importing this module from a
 * client component can never throw on a missing secret.
 *
 * Each `process.env.X` is referenced literally — Next replaces these at build
 * time by static analysis, so dynamic lookups would silently come back
 * undefined in the browser.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("must be a valid Supabase URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "is required"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "is required"),
  // Optional and not yet used (CP-11). Treat an empty value in .env.local the
  // same as absent — `.optional()` alone only permits `undefined`, so a present
  // but empty string would (wrongly) fail a `.min(1)` check.
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")} ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid ${label} environment configuration:\n${details}\n\n` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
  }

  return result.data;
}

export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  "client",
);

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/** Server-only. Throws if called from the browser bundle. */
export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called on the client — this would leak secrets.");
  }

  cachedServerEnv ??= parse(
    serverSchema,
    {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
    "server",
  );

  return cachedServerEnv;
}
