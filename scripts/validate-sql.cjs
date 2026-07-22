/**
 * Parse every migration with the real PostgreSQL grammar (WASM build of the
 * server's own parser). Catches syntax errors without needing a live database.
 *
 * Usage:  node scripts/validate-sql.cjs [file...]
 *
 * A fresh parser instance is created per file: the emscripten build's flex
 * scanner does not reliably reset between large inputs, and a stale buffer
 * surfaces as "fatal flex scanner internal error" on an otherwise valid file.
 *
 * Note: this validates SYNTAX only. Semantic errors — a wrong column name, a
 * missing table, a bad policy predicate — still require applying the migrations
 * to a real Postgres instance.
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "supabase", "migrations");
const mod = require("pg-query-emscripten");
const init = mod.default ?? mod;

async function parseFile(file) {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  const pg = await init();
  const result = pg.parse(sql);

  if (!result.error) {
    return { ok: true, statements: result.parse_tree?.stmts?.length ?? 0 };
  }

  const { message, cursorpos } = result.error;
  const upto = sql.slice(0, cursorpos ?? 0);
  const line = upto.split("\n").length;
  const col = (cursorpos ?? 0) - upto.lastIndexOf("\n");
  return { ok: false, message, line, col, sql };
}

(async () => {
  const requested = process.argv.slice(2);
  const files = requested.length
    ? requested
    : fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  let failures = 0;

  for (const file of files) {
    let res;
    try {
      res = await parseFile(file);
    } catch (err) {
      res = { ok: false, message: `parser crashed: ${err.message}`, line: 0, col: 0 };
    }

    if (res.ok) {
      console.log(`ok   ${file}  (${res.statements} statements)`);
      continue;
    }

    failures++;
    console.log(`FAIL ${file}:${res.line}:${res.col}  ${res.message}`);
    if (res.sql) {
      const lines = res.sql.split("\n");
      for (let i = Math.max(0, res.line - 3); i < Math.min(lines.length, res.line + 1); i++) {
        console.log(`   ${String(i + 1).padStart(4)} | ${lines[i]}`);
      }
    }
    console.log("");
  }

  console.log(
    failures
      ? `\n${failures} of ${files.length} file(s) failed to parse.`
      : `\nAll ${files.length} migrations parse cleanly.`,
  );
  process.exit(failures ? 1 : 0);
})();
