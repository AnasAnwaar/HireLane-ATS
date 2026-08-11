/**
 * Database runner for migrations and verification.
 *
 *   node scripts/db.cjs migrate            apply supabase/migrations/*.sql in order
 *   node scripts/db.cjs reset              drop and recreate the public schema
 *   node scripts/db.cjs query "<sql>"      run one statement and print the rows
 *   node scripts/db.cjs file <path>        run one .sql file
 *
 * Uses DIRECT_URL (session pooler): the transaction pooler on :6543 cannot run
 * DDL. Each file runs inside a transaction, so a failure rolls back cleanly
 * rather than leaving half a migration applied.
 */
const fs = require("fs");
const path = require("path");

// A DIRECT_URL provided in the shell wins over .env.local, so you can point a
// single command at a different database (e.g. production):
//   DIRECT_URL="postgres://…prod…" npm run db:migrate
const shellDirectUrl = process.env.DIRECT_URL;
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
if (shellDirectUrl) process.env.DIRECT_URL = shellDirectUrl;

const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

async function connect() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/** Report a Postgres error against the line it came from. */
function describeError(err, sql, label) {
  console.log(`\nFAIL ${label}`);
  console.log(`  ${err.severity ?? "ERROR"}: ${err.message}`);
  if (err.hint) console.log(`  HINT: ${err.hint}`);
  if (err.detail) console.log(`  DETAIL: ${err.detail}`);

  if (err.position && sql) {
    const upto = sql.slice(0, Number(err.position) - 1);
    const line = upto.split("\n").length;
    console.log(`  at line ${line}:`);
    const lines = sql.split("\n");
    for (let i = Math.max(0, line - 3); i < Math.min(lines.length, line + 2); i++) {
      const marker = i === line - 1 ? ">" : " ";
      console.log(`  ${marker} ${String(i + 1).padStart(4)} | ${lines[i]}`);
    }
  }
}

async function runFile(client, filePath, label) {
  const sql = fs.readFileSync(filePath, "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`OK   ${label}`);
    return true;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    describeError(err, sql, label);
    return false;
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  const client = await connect();

  try {
    if (command === "migrate") {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const ok = await runFile(client, path.join(MIGRATIONS_DIR, file), file);
        if (!ok) process.exitCode = 1;
        if (!ok) return;
      }
      console.log(`\nAll ${files.length} migrations applied.`);
      return;
    }

    if (command === "reset") {
      // Safe here only because this database holds nothing but our own schema.
      await client.query("drop schema if exists public cascade");
      await client.query("create schema public");
      await client.query("grant usage on schema public to anon, authenticated, service_role");
      await client.query(
        "grant all on all tables in schema public to anon, authenticated, service_role",
      );
      console.log("public schema reset.");
      return;
    }

    if (command === "file") {
      const ok = await runFile(client, path.resolve(arg), path.basename(arg));
      if (!ok) process.exitCode = 1;
      return;
    }

    if (command === "query") {
      const result = await client.query(arg);
      if (Array.isArray(result)) {
        for (const r of result) if (r.rows?.length) console.table(r.rows);
      } else if (result.rows?.length) {
        console.table(result.rows);
      } else {
        console.log(`${result.command} — ${result.rowCount ?? 0} row(s)`);
      }
      return;
    }

    console.log("Usage: node scripts/db.cjs <migrate|reset|query|file> [arg]");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
