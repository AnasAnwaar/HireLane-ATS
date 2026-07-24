/**
 * Guard against drift between the permission catalogue in the database and the
 * typed keys in src/lib/permissions/keys.ts.
 *
 *   node scripts/check-permission-keys.cjs
 *
 * A key in code but not the DB means a check that can never pass. A key in the
 * DB but not code means a capability the app can't reference type-safely. Either
 * is a latent bug; this fails loudly on both.
 */
const path = require("path");
const { Client } = require("pg");

process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

// Pull the code-side keys out of keys.ts without importing TS.
const fs = require("fs");
const keysSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "lib", "permissions", "keys.ts"),
  "utf8",
);
const block = keysSrc.match(/PERMISSION_KEYS = \[([\s\S]*?)\] as const/);
if (!block) {
  console.error("Could not locate PERMISSION_KEYS in keys.ts");
  process.exit(1);
}
const codeKeys = new Set(
  [...block[1].matchAll(/"([a-z_]+\.[a-z0-9_]+)"/g)].map((m) => m[1]),
);

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query("select key from public.permissions");
  await client.end();

  const dbKeys = new Set(rows.map((r) => r.key));

  const inCodeNotDb = [...codeKeys].filter((k) => !dbKeys.has(k));
  const inDbNotCode = [...dbKeys].filter((k) => !codeKeys.has(k));

  if (inCodeNotDb.length) {
    console.log("In code but NOT in database (checks that can never pass):");
    inCodeNotDb.forEach((k) => console.log(`  - ${k}`));
  }
  if (inDbNotCode.length) {
    console.log("In database but NOT in code (untyped capabilities):");
    inDbNotCode.forEach((k) => console.log(`  - ${k}`));
  }

  if (!inCodeNotDb.length && !inDbNotCode.length) {
    console.log(`In sync: ${codeKeys.size} permission keys match the database.`);
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
