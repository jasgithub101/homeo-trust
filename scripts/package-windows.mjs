// Windows self-host packager — RUNS ON THE BUILD HOST (Windows x64 ONLY for a
// shippable zip). Produces packaging/windows/dist/ and a versioned zip.
//
// HARD REQUIREMENT: assemble the shippable zip on Windows x64 so the traced
// @node-rs/argon2 binary, the Prisma Windows schema-engine, and the bundled
// portable Node/Postgres are all win32-x64. Do NOT ship a zip assembled on
// Linux/WSL — those binaries are the wrong platform and fail only on the
// customer machine.
//
// Two shippable variants (--variant):
//   full  — bundles portable node\ AND postgres\. The customer runs entirely
//           offline against a bundled local PostgreSQL (Option A). Larger zip.
//   lite  — bundles portable node\ ONLY, no postgres\. The customer points
//           DATABASE_URL/DIRECT_URL at a remote database such as Neon (Option B).
//           Much smaller zip; needs internet; PII leaves the machine.
//   Both variants carry the SAME app\ + tools\ + scripts. Mode is chosen on the
//   customer machine at setup time (see packaging/windows/lib/ht.mjs): a full
//   package can ALSO run remote if the user pre-fills a remote DATABASE_URL.
//
// Usage (Windows build host):
//   node scripts/package-windows.mjs --variant full   # bundled local PG
//   node scripts/package-windows.mjs --variant lite    # remote/Neon, no PG
//   node scripts/package-windows.mjs --variant full --dry-run   # Linux sanity
//       --dry-run runs `next build`, bundles seed.cjs, copies standalone/static/
//       public + schema/migrations, writes tools/package.json — SKIPS binary
//       placement, tools install/generate, and zipping. NOT a shippable artifact.
//       (Linux-safe; lets the copy paths be validated without win32 binaries.)
//
// Portable Node/Postgres are staged by the build host into ./vendor (gitignored)
// or via VENDOR_NODE_DIR / VENDOR_PG_DIR; this script copies, never downloads.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "packaging", "windows", "dist");
const WIN = join(ROOT, "packaging", "windows");

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes("--dry-run");
const vIdx = ARGV.indexOf("--variant");
const VARIANT = vIdx !== -1 ? ARGV[vIdx + 1] : "full";
if (!["full", "lite"].includes(VARIANT)) {
  throw new Error(`--variant must be 'full' or 'lite' (got '${VARIANT ?? "(none)"}')`);
}
const APP_URL = "http://127.0.0.1:8787"; // fixed port 8787 (baked at build = runtime)

// Pinned bundle versions — keep these in sync with README + the hand-off.
const PINNED = {
  node: "20.18.1", // node-v20.18.1-win-x64
  postgresMajor: "16", // EDB PostgreSQL 16.x windows-x64 binaries (pin the major)
};

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version ?? "0.0.0";

function log(step) {
  console.log(`\n=== ${step} ===`);
}
function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  // NOTE: pnpm is pnpm.cmd on Windows; since the Node CVE-2024-27980 fix,
  // spawning a .cmd/.bat requires shell:true (callers pass shell:true for pnpm).
  // node/powershell are real .exe and stay shell:false (robust to spaces in paths).
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(" ")}`);
  }
}

console.log(`Building variant: ${VARIANT}${DRY ? " (--dry-run, Linux sanity)" : ""}`);

// 1. Clean dist.
log("clean dist");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// 2. Generate the Prisma Client so the app + prisma/seed.ts type-check. A fresh
//    `pnpm install` does NOT run `prisma generate` (no postinstall hook), so on a
//    clean build host @prisma/client has no types and `next build` fails.
log("prisma generate (client for build + typecheck)");
run("pnpm", ["exec", "prisma", "generate"], { cwd: ROOT, shell: true });

// 3. Production build (NEXT_PUBLIC_APP_URL baked to the fixed port).
log("next build (output: standalone)");
run("pnpm", ["exec", "next", "build"], {
  cwd: ROOT,
  env: { ...process.env, NEXT_PUBLIC_APP_URL: APP_URL, NEXT_TELEMETRY_DISABLED: "1" },
  shell: true, // pnpm.cmd on Windows needs a shell
});

// 3. Assemble app/ = the standalone server + THE ASSET-COPY GOTCHA.
//    `.next/static` and `public/` are NOT in `.next/standalone` and must be
//    copied next to server.js or every asset 404s.
log("assemble app/ (standalone + static + public)");
const STANDALONE = join(ROOT, ".next", "standalone");
const APP = join(DIST, "app");
if (!existsSync(join(STANDALONE, "server.js"))) {
  throw new Error("Missing .next/standalone/server.js — is output:'standalone' set?");
}
cpSync(STANDALONE, APP, { recursive: true });
cpSync(join(ROOT, ".next", "static"), join(APP, ".next", "static"), { recursive: true }); // GOTCHA 1
if (existsSync(join(ROOT, "public"))) {
  cpSync(join(ROOT, "public"), join(APP, "public"), { recursive: true }); // GOTCHA 2 (if present)
  console.log("copied public/ -> app/public");
} else {
  console.log("no public/ to copy (ok)");
}

// 4. tools/ = self-contained migrator/seeder (prisma CLI + schema + migrations
//    + compiled seed + opt-in backfills). Installed/generated on the build host.
log("assemble tools/ (migrator)");
const TOOLS = join(DIST, "tools");
mkdirSync(join(TOOLS, "prisma"), { recursive: true });

// 4a. Ship the schema VERBATIM. Prisma 7.8 FORBIDS `url` inside the schema's
//     datasource block (P1012: "the datasource property url is no longer
//     supported in schema files"), so we must NOT inject it. The repo schema is
//     already config-based (datasource has only `provider`); the URL is supplied
//     by a bundled prisma.config.mjs (4a-bis), mirroring the repo's
//     prisma.config.ts.
cpSync(join(ROOT, "prisma", "schema.prisma"), join(TOOLS, "prisma", "schema.prisma"));
cpSync(join(ROOT, "prisma", "migrations"), join(TOOLS, "prisma", "migrations"), { recursive: true });

// 4a-bis. Bundle a standalone prisma.config.mjs for the migrator. It feeds the
//     datasource URL from the environment (DIRECT_URL preferred — direct/non-pooled
//     — falling back to DATABASE_URL), exactly like the repo's prisma.config.ts.
//     WHY .mjs (not .ts): the customer machine has NO TypeScript toolchain. Prisma
//     7.8's config loader (@prisma/config -> c12 + jiti) supports .ts/.mts/.cts/.js/
//     .mjs/.cjs; a plain ESM .mjs loads with zero transpilation. WHY it resolves at
//     runtime: lib/ht.mjs runs `prisma migrate deploy` with cwd = tools/ and the
//     generated .env merged into process.env, so Prisma auto-discovers this config
//     (cwd-based) and process.env already carries DIRECT_URL/DATABASE_URL — in BOTH
//     local mode (URL points at the bundled 127.0.0.1:5433 Postgres) and remote mode
//     (the user's Neon URL). `migrations.seed` is intentionally omitted: seeding is
//     done by the bundled tools/seed.cjs, not the Prisma CLI (which would need tsx).
const toolsPrismaConfig = `import { defineConfig } from "prisma/config";

// Standalone migrator config for the Homeo Trust Windows self-host package.
// Generated by scripts/package-windows.mjs — do not edit by hand.
export default defineConfig({
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
`;
writeFileSync(join(TOOLS, "prisma.config.mjs"), toolsPrismaConfig);

// 4b. Bundle seed.ts -> tools/seed.cjs (esbuild). Local TS (keys.ts) is inlined;
//     node_modules stay external and are resolved from tools/node_modules.
log("bundle seed.cjs (esbuild)");
const esbuild = (await import("esbuild")).default ?? (await import("esbuild"));
await esbuild.build({
  entryPoints: [join(ROOT, "prisma", "seed.ts")],
  outfile: join(TOOLS, "seed.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  packages: "external", // keep @prisma/client, @node-rs/argon2, pg, zod, dotenv external
});

// 4c. Opt-in backfills (compiled). NOT run at first install; only when a release
//     note says so. seed-explore-testdata.ts is DEV-only and deliberately omitted.
log("bundle opt-in backfills");
const backfills = [
  "backfill-attachment-view",
  "backfill-explore-bypass",
  "backfill-explore-view",
  "backfill-patient-view-assigned",
];
mkdirSync(join(TOOLS, "backfills"), { recursive: true });
for (const b of backfills) {
  await esbuild.build({
    entryPoints: [join(ROOT, "scripts", `${b}.ts`)],
    outfile: join(TOOLS, "backfills", `${b}.cjs`),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    packages: "external",
  });
}

// 4d. tools/package.json — the migrator's runtime deps. Installed + generated on
//     the WINDOWS build host so the Prisma Windows schema-engine + native
//     @node-rs/argon2 land here.
const toolsPkg = {
  name: "homeo-trust-tools",
  private: true,
  version: VERSION,
  dependencies: {
    prisma: pkg.devDependencies.prisma,
    "@prisma/client": pkg.dependencies["@prisma/client"],
    "@prisma/adapter-pg": pkg.dependencies["@prisma/adapter-pg"],
    "@node-rs/argon2": pkg.dependencies["@node-rs/argon2"],
    pg: pkg.dependencies.pg,
    zod: pkg.dependencies.zod,
    dotenv: pkg.devDependencies.dotenv,
  },
};
writeFileSync(join(TOOLS, "package.json"), JSON.stringify(toolsPkg, null, 2) + "\n");

if (DRY) {
  console.log(
    "\n[DRY RUN] Skipped: tools install+generate, portable node/postgres placement, zip.",
  );
  console.log("[DRY RUN] dist assembled at:", DIST);
  console.log("[DRY RUN] This is a Linux-safe sanity pass — NOT a shippable artifact.");
  process.exit(0);
}

// --- FULL MODE (Windows x64 build host only) -------------------------------

// 4e. Install + generate inside tools/ so the Windows engine + client are ready.
log("tools: pnpm install + prisma generate (Windows engine)");
// Two flags are essential here:
//  --ignore-workspace : without it pnpm walks up to the repo's pnpm-workspace.yaml
//    and installs the WHOLE workspace (and --prod then prunes the repo's root
//    devDeps) instead of installing tools/package.json into tools/node_modules.
//  --config.dangerouslyAllowAllBuilds=true : pnpm v10+ blocks postinstall build
//    scripts by default; prisma/@prisma/engines need theirs to run so the Windows
//    schema-engine binary downloads into tools/node_modules (required for
//    `prisma migrate deploy` on the customer). This is safe because tools/ holds a
//    FIXED first-party dependency set we curate, installed in isolation — not
//    arbitrary packages. (The old package.json `pnpm.onlyBuiltDependencies` field
//    is no longer read by pnpm v11.) shell:true because pnpm is pnpm.cmd on Windows.
run(
  "pnpm",
  ["install", "--prod", "--ignore-workspace", "--config.dangerouslyAllowAllBuilds=true", "--dir", TOOLS],
  { cwd: TOOLS, shell: true },
);
run("node", [join(TOOLS, "node_modules", "prisma", "build", "index.js"), "generate", "--schema", join(TOOLS, "prisma", "schema.prisma")], { cwd: TOOLS });

// 5. Portable Node (both variants) + Postgres (full ONLY — lite is remote-DB).
//    Staged by the build host; copied, never downloaded.
log(VARIANT === "full" ? "copy portable node/ + postgres/" : "copy portable node/ (lite: no postgres)");
const vendorNode = process.env.VENDOR_NODE_DIR ?? join(ROOT, "vendor", "node");
const vendorPg = process.env.VENDOR_PG_DIR ?? join(ROOT, "vendor", "postgres");
const vendors = [
  ["node", vendorNode, join(DIST, "node"), `node-v${PINNED.node}-win-x64`],
];
if (VARIANT === "full") {
  vendors.push(["postgres", vendorPg, join(DIST, "postgres"), `PostgreSQL ${PINNED.postgresMajor}.x windows-x64 binaries`]);
}
for (const [label, src, dest, hint] of vendors) {
  if (!existsSync(src)) {
    throw new Error(`Missing portable ${label} at ${src}. Stage ${hint} there (or set VENDOR_${label.toUpperCase()}_DIR).`);
  }
  cpSync(src, dest, { recursive: true });
}

// 6. Customer-facing files (scripts + README + .env template).
log("copy customer scripts + README + .env.example");
for (const f of ["setup.bat", "start.bat", "update.bat", "repair.bat", "README.txt"]) {
  cpSync(join(WIN, f), join(DIST, f));
}
cpSync(join(WIN, "lib"), join(DIST, "lib"), { recursive: true });
cpSync(join(ROOT, ".env.example"), join(DIST, ".env.example"));

// 7. Zip. (Windows has tar.exe with zip support; or use Compress-Archive.)
log("zip");
const zipName = `HomeoTrust-${VERSION}-win-x64-${VARIANT}.zip`;
run("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${DIST}\\*' -DestinationPath '${join(ROOT, zipName)}' -Force`]);
console.log(`\nDONE (${VARIANT}) -> ${join(ROOT, zipName)}`);
console.log(
  VARIANT === "full"
    ? `Pinned: Node ${PINNED.node}, PostgreSQL major ${PINNED.postgresMajor}.`
    : `Pinned: Node ${PINNED.node}. (lite: no bundled PostgreSQL — customer supplies a remote DATABASE_URL.)`,
);
