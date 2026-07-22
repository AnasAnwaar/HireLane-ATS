import path from "node:path";

import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved connection URLs out of schema.prisma and into this file.
 *
 * Two things worth knowing:
 *
 * 1. Next.js loads `.env.local` automatically; the Prisma CLI does not — it only
 *    reads `.env`. Loading it explicitly keeps a single source of secrets rather
 *    than duplicating the connection string into a second file.
 *
 * 2. The URL here is DIRECT_URL (session pooler, :5432), not DATABASE_URL. The
 *    transaction pooler on :6543 cannot run introspection or DDL, so pointing
 *    Prisma's CLI at it fails in confusing ways.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // Fine in CI or anywhere the vars are already exported.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
