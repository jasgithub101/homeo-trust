// Homeo Trust — Windows self-host helper. RUNS ON THE CUSTOMER MACHINE via the
// bundled portable Node (node\node.exe). The .bat files are thin wrappers that
// call: node lib\ht.mjs <command>.
//
// Two database modes, auto-detected (detectMode / HT_DB_MODE in .env):
//   local  — bundled portable Postgres at 127.0.0.1:5433 (full variant, default).
//   remote — external DB via the user's DATABASE_URL, e.g. Neon (lite variant, or
//            a full package whose .env was pre-filled with a remote URL). The db-*
//            commands no-op in remote mode; attachments stay LOCAL in both modes.
//
// Commands:
//   gen-env        Create/complete root .env (secrets + admin temp pw; local: also
//                  DB pw + local URL. remote: keep user's URL, fill the rest).
//   db-init        initdb (scram, loopback, port 5433) + create role/db (single-user, no trust). [local only]
//   db-start|db-stop|db-status
//   migrate        prisma migrate deploy (env-loaded; idempotent; never dev/diff/reset).
//   seed           run the bundled idempotent seed (creates first admin once).
//   backfill <name>  opt-in upgrade backfill (only when a release note says so).
//   check-port     refuse if 8787 is already serving (no double-start).
//   serve          launch app\server.js on 127.0.0.1:8787 (loopback only).
//   repair         regenerate AUTH_SECRET + DB pw in .env and re-sync the DB role
//                  password against existing pgdata (single-user mode; NO trust).
//   print-admin    print the first-admin URL + temp password (after gen-env created it).
//
// Security: app + Postgres bind 127.0.0.1 only; Postgres auth stays scram. Secrets
// (AUTH_SECRET, DB password) live ONLY in root .env — never committed, never in the
// zip. The DB password is hex (URL/SQL-safe); AUTH_SECRET is base64 (env-only).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, ".."); // install dir (parent of lib\)

const PATHS = {
  env: join(ROOT, ".env"),
  envExample: join(ROOT, ".env.example"),
  data: join(ROOT, "data"),
  pgdata: join(ROOT, "data", "pgdata"),
  attachments: join(ROOT, "data", "attachments"),
  pgLog: join(ROOT, "data", "pg.log"),
  pgbin: join(ROOT, "postgres", "bin"),
  tools: join(ROOT, "tools"),
  prismaCli: join(ROOT, "tools", "node_modules", "prisma", "build", "index.js"),
  schema: join(ROOT, "tools", "prisma", "schema.prisma"),
  seed: join(ROOT, "tools", "seed.cjs"),
  appServer: join(ROOT, "app", "server.js"),
};

const PG = { port: "5433", host: "127.0.0.1", db: "homeo_trust", role: "homeo" };
const APP = { host: "127.0.0.1", port: "8787", url: "http://127.0.0.1:8787" };
const LOCAL_DB_URL_RE = new RegExp(`@${PG.host}:${PG.port}/${PG.db}`);

const pgBin = (name) => join(PATHS.pgbin, `${name}.exe`);
const die = (msg) => {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
};

// ---------- mode (local bundled PG vs remote DB) ----------
// "local"  — this package bundled portable Postgres and runs it at 127.0.0.1:5433.
// "remote" — no bundled Postgres (lite), or the user pointed DATABASE_URL at an
//            external database (e.g. Neon). Attachments stay LOCAL in both modes.
const hasBundledPg = () => existsSync(pgBin("postgres"));
// The dev placeholders shipped in .env.example are NOT a usable remote URL.
const PLACEHOLDER_URL_MARKERS = ["homeo_dev_password", "USER:PASSWORD", "REPLACE", "<", "example.com/"];
function isUsableRemoteUrl(u) {
  if (!u) return false;
  if (LOCAL_DB_URL_RE.test(u)) return false; // our own generated local URL
  return !PLACEHOLDER_URL_MARKERS.some((m) => u.includes(m));
}
function detectMode(env = readEnv()) {
  if (env.HT_DB_MODE === "local" || env.HT_DB_MODE === "remote") return env.HT_DB_MODE;
  if (isUsableRemoteUrl(env.DATABASE_URL)) return "remote"; // user pre-filled a remote URL
  return hasBundledPg() ? "local" : "remote";
}
const isRemote = () => detectMode() === "remote";

// ---------- .env helpers ----------
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1); // value verbatim (no quote stripping)
  }
  return out;
}
function readEnv() {
  return existsSync(PATHS.env) ? parseEnv(readFileSync(PATHS.env, "utf8")) : {};
}
function serializeEnv(obj, header) {
  const lines = header ? [header, ""] : [];
  for (const [k, v] of Object.entries(obj)) lines.push(`${k}=${v}`);
  return lines.join("\n") + "\n";
}
function writeEnv(obj) {
  writeFileSync(
    PATHS.env,
    serializeEnv(
      obj,
      `# Homeo Trust — generated ${new Date().toISOString()}.\n# DO NOT COMMIT. BACK THIS FILE UP (AUTH_SECRET + DB password live ONLY here).`,
    ),
    { mode: 0o600 },
  );
}
// Merge: keep every key the user already set; only add the missing ones.
function fillMissing(existing, defaults) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(defaults)) {
    if (out[k] === undefined || out[k] === "") out[k] = v;
  }
  return out;
}
const b64 = (n) => randomBytes(n).toString("base64");
const hex = (n) => randomBytes(n).toString("hex");

// App/admin/storage settings shared by both modes. Attachments are ALWAYS local
// (under data\attachments) even when the database is remote.
function commonEnv({ authSecret, adminPw, mode }) {
  return {
    AUTH_SECRET: authSecret,
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: APP.url,
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: APP.host,
    PORT: APP.port,
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: PATHS.attachments, // absolute, under data\ (survives updates)
    FIRST_ADMIN_NAME: "Administrator",
    FIRST_ADMIN_EMAIL: "admin@example.com",
    FIRST_ADMIN_USERNAME: "admin",
    // seed.ts reads FIRST_ADMIN_TEMP_PASSWORD (not *_PASSWORD).
    FIRST_ADMIN_TEMP_PASSWORD: adminPw,
    HT_DB_MODE: mode,
  };
}

function buildEnv({ dbPw, authSecret, adminPw }) {
  const url = `postgresql://${PG.role}:${dbPw}@${PG.host}:${PG.port}/${PG.db}`;
  return {
    DATABASE_URL: url,
    DIRECT_URL: url,
    ...commonEnv({ authSecret, adminPw, mode: "local" }),
  };
}

const genAdminPw = () => b64(12).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || hex(8);

// ---------- commands ----------
function cmdGenEnv() {
  mkdirSync(PATHS.data, { recursive: true });
  mkdirSync(PATHS.attachments, { recursive: true });
  const existing = readEnv();
  const mode = detectMode(existing);
  if (mode === "remote") return genEnvRemote(existing);
  return genEnvLocal(existing);
}

// LOCAL (full variant, bundled Postgres). Idempotent: if a full .env already
// exists, leave it untouched so re-running setup never rotates secrets.
function genEnvLocal(existing) {
  if (existing.DATABASE_URL) {
    console.log(".env already exists — leaving it untouched (idempotent, local mode).");
    return;
  }
  writeEnv(buildEnv({ dbPw: hex(24), authSecret: b64(48), adminPw: genAdminPw() }));
  console.log("Generated root .env (local mode: secrets + DB password + admin temp password).");
}

// REMOTE (lite variant, or full pointed at an external DB). The user supplies
// DATABASE_URL/DIRECT_URL (e.g. Neon); we only FILL the missing pieces and never
// overwrite what they set. Idempotent: re-running only adds absent keys.
function genEnvRemote(existing) {
  if (!isUsableRemoteUrl(existing.DATABASE_URL)) {
    // Give them a file to edit, then stop with clear instructions.
    if (!existsSync(PATHS.env)) {
      if (existsSync(PATHS.envExample)) {
        writeFileSync(PATHS.env, readFileSync(PATHS.envExample, "utf8"), { mode: 0o600 });
      }
      console.log("Created .env from the template.");
    }
    die(
      "Remote database mode: edit .env and set DATABASE_URL (your provider's POOLED\n" +
        "  connection) and DIRECT_URL (the DIRECT/non-pooled connection), both ending in\n" +
        "  ?sslmode=require for Neon. Then re-run setup.bat. See README.txt > Option B.",
    );
  }
  const merged = fillMissing(existing, {
    DIRECT_URL: existing.DATABASE_URL, // default DIRECT_URL to DATABASE_URL if absent
    ...commonEnv({ authSecret: b64(48), adminPw: genAdminPw(), mode: "remote" }),
  });
  writeEnv(merged);
  console.log("Updated root .env (remote mode: kept your DATABASE_URL/DIRECT_URL, filled secrets + admin temp password).");
}

function pgEnv() {
  // PGPASSWORD not needed: bootstrap/repair use single-user mode (no auth).
  return { ...process.env, PGDATA: PATHS.pgdata };
}

function singleUserSQL(sql, dbName = "postgres") {
  // postgres --single: standalone backend, NO client auth, server must be stopped.
  // This is how we create/alter roles without enabling pg_hba "trust".
  const r = spawnSync(pgBin("postgres"), ["--single", "-D", PATHS.pgdata, dbName], {
    input: sql.endsWith("\n") ? sql : sql + "\n",
    encoding: "utf8",
    env: pgEnv(),
  });
  if (r.status !== 0) {
    die(`single-user postgres failed:\n${r.stderr || r.stdout || r.error}`);
  }
  return r.stdout;
}

function cmdDbInit() {
  if (isRemote()) {
    console.log("Remote database mode — no local PostgreSQL to initialize (skipped).");
    return;
  }
  if (existsSync(join(PATHS.pgdata, "PG_VERSION"))) {
    console.log("pgdata already initialized — skipping initdb.");
    return;
  }
  mkdirSync(PATHS.data, { recursive: true });
  const r = spawnSync(
    pgBin("initdb"),
    ["-D", PATHS.pgdata, "-U", "postgres", "-E", "UTF8",
     "--auth-host=scram-sha-256", "--auth-local=scram-sha-256", "--no-instructions"],
    { stdio: "inherit", env: pgEnv() },
  );
  if (r.status !== 0) die("initdb failed");

  // Loopback-only, fixed port. (Appended overrides win over defaults.)
  appendFileSync(
    join(PATHS.pgdata, "postgresql.conf"),
    `\n# Homeo Trust self-host overrides\nlisten_addresses = '127.0.0.1'\nport = ${PG.port}\n`,
  );
  // scram over loopback ONLY; no trust, no LAN.
  writeFileSync(
    join(PATHS.pgdata, "pg_hba.conf"),
    [
      "# Homeo Trust — loopback-only, scram. Do not add trust or non-local hosts.",
      "host all all 127.0.0.1/32 scram-sha-256",
      "host all all ::1/128      scram-sha-256",
      "",
    ].join("\n"),
  );

  // Create app role + database WITHOUT a running server (no trust).
  const dbPw = readEnv().DATABASE_URL?.match(/\/\/[^:]+:([^@]+)@/)?.[1];
  if (!dbPw) die("Cannot read DB password from .env — run gen-env first.");
  singleUserSQL(
    `CREATE ROLE ${PG.role} LOGIN PASSWORD '${dbPw}';\nCREATE DATABASE ${PG.db} OWNER ${PG.role};`,
  );
  console.log("Initialized Postgres (scram, loopback, port 5433) and created role/db.");
}

function pgCtl(args, label) {
  const r = spawnSync(pgBin("pg_ctl"), ["-D", PATHS.pgdata, ...args], {
    stdio: "inherit",
    env: pgEnv(),
  });
  if (r.status !== 0) die(`pg_ctl ${label} failed`);
}
function isPgRunning() {
  const r = spawnSync(pgBin("pg_ctl"), ["-D", PATHS.pgdata, "status"], { env: pgEnv() });
  return r.status === 0; // pg_ctl status: 0 = running, 3 = not running
}
function cmdDbStart() {
  if (isRemote()) {
    console.log("Remote database mode — using your external database (no local PostgreSQL to start).");
    return;
  }
  if (isPgRunning()) {
    console.log("Postgres already running.");
    return;
  }
  pgCtl(["-l", PATHS.pgLog, "-w", "-o", `-p ${PG.port}`, "start"], "start");
  console.log("Postgres started on 127.0.0.1:5433.");
}
function cmdDbStop() {
  if (isRemote()) {
    console.log("Remote database mode — no local PostgreSQL to stop (skipped).");
    return;
  }
  if (!isPgRunning()) {
    console.log("Postgres not running.");
    return;
  }
  pgCtl(["-m", "fast", "stop"], "stop");
}
function cmdDbStatus() {
  console.log(isPgRunning() ? "running" : "stopped");
}

// Load .env and run a child with that environment (loopback, secrets in-process).
function runWithEnv(cmd, args, opts = {}) {
  const merged = { ...process.env, ...readEnv() };
  const r = spawnSync(cmd, args, { stdio: "inherit", env: merged, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
function cmdMigrate() {
  if (!existsSync(PATHS.prismaCli)) die("Prisma CLI missing in tools\\ — broken package.");
  // deploy ONLY — applies committed migrations; never dev/diff/reset; no shadow DB.
  runWithEnv(process.execPath, [PATHS.prismaCli, "migrate", "deploy", "--schema", PATHS.schema], { cwd: PATHS.tools });
}
function cmdSeed() {
  runWithEnv(process.execPath, [PATHS.seed], { cwd: PATHS.tools });
}
function cmdBackfill(name) {
  if (!name) die("backfill needs a name, e.g. backfill-explore-view");
  const f = join(PATHS.tools, "backfills", `${name}.cjs`);
  if (!existsSync(f)) die(`unknown backfill: ${name}`);
  runWithEnv(process.execPath, [f], { cwd: PATHS.tools });
}

function cmdCheckPort() {
  const sock = net.connect({ host: APP.host, port: Number(APP.port) }, () => {
    sock.destroy();
    die(`Port ${APP.port} is already in use — is Homeo Trust already running? Refusing to start a second instance.`);
  });
  sock.on("error", () => process.exit(0)); // nothing listening → ok to start
  sock.setTimeout(1500, () => { sock.destroy(); process.exit(0); });
}

function cmdServe() {
  const merged = { ...process.env, ...readEnv() };
  merged.HOSTNAME = APP.host; // force loopback regardless of .env drift
  merged.PORT = APP.port;
  if (!existsSync(PATHS.appServer)) die("app\\server.js missing — broken package.");
  const r = spawnSync(process.execPath, [PATHS.appServer], {
    stdio: "inherit",
    cwd: join(ROOT, "app"), // standalone server resolves .next/static + public from here
    env: merged,
  });
  process.exit(r.status ?? 0);
}

function cmdRepair() {
  // Re-sync secrets against the EXISTING database without losing data. Caller
  // (repair.bat) stops the server first. Uses single-user mode — NO trust.
  if (isRemote()) {
    die(
      "Repair manages the BUNDLED local database password and is not used in remote mode.\n" +
        "  In remote mode your database lives at your provider; to recover a lost .env,\n" +
        "  re-create it (copy .env.example to .env, paste your DATABASE_URL/DIRECT_URL from\n" +
        "  the provider dashboard) and re-run setup.bat. See README.txt > Option B recovery.",
    );
  }
  if (!existsSync(join(PATHS.pgdata, "PG_VERSION"))) {
    die("No existing database to repair (data\\pgdata missing). Run setup.bat instead.");
  }
  if (isPgRunning()) cmdDbStop();
  const prev = readEnv();
  const env = buildEnv({
    dbPw: hex(24),
    authSecret: b64(48),
    // keep prior admin temp pw if present (admin already exists; not reset here)
    adminPw: prev.FIRST_ADMIN_TEMP_PASSWORD?.length ? prev.FIRST_ADMIN_TEMP_PASSWORD : b64(12).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16),
  });
  const newPw = env.DATABASE_URL.match(/\/\/[^:]+:([^@]+)@/)[1];
  singleUserSQL(`ALTER ROLE ${PG.role} PASSWORD '${newPw}';`);
  writeEnv(env);
  console.log("Repair complete: regenerated AUTH_SECRET + DB password and re-synced the DB role.");
  console.log("All existing login sessions are invalidated (new AUTH_SECRET) — users must sign in again.");
}

function cmdPrintAdmin() {
  const e = readEnv();
  const mode = detectMode(e);
  console.log("\n========================================================");
  console.log("  Homeo Trust is ready.");
  console.log(`  Database:  ${mode === "remote" ? "remote (your external database)" : "local (bundled, on this PC)"}`);
  console.log(`  Open:      ${APP.url}`);
  console.log(`  Username:  ${e.FIRST_ADMIN_USERNAME ?? "admin"}`);
  console.log(`  Temp password: ${e.FIRST_ADMIN_TEMP_PASSWORD ?? "(see .env)"}`);
  console.log("  You must change this password on first login.");
  console.log("  BACK UP the .env file in this folder — it holds your secret key.");
  console.log("========================================================\n");
}

const [cmd, arg] = process.argv.slice(2);
const table = {
  "gen-env": cmdGenEnv,
  "db-init": cmdDbInit,
  "db-start": cmdDbStart,
  "db-stop": cmdDbStop,
  "db-status": cmdDbStatus,
  migrate: cmdMigrate,
  seed: cmdSeed,
  backfill: () => cmdBackfill(arg),
  "check-port": cmdCheckPort,
  serve: cmdServe,
  repair: cmdRepair,
  "print-admin": cmdPrintAdmin,
};
if (!table[cmd]) die(`unknown command: ${cmd ?? "(none)"}`);
table[cmd]();
