/**
 * DEV-ONLY test data for exercising the Phase 8 Explore manual checklist.
 *
 *   pnpm exec tsx scripts/seed-explore-testdata.ts
 *
 * Creates three non-admin test users (distinct permission profiles), three test
 * roles, and a set of patients whose cohorts are deliberately sized to exercise
 * k-anonymity (some ≥ 5, some < 5, plus a zero-match path). It then rebuilds the
 * de-identified `explore_case_view` so Explore works immediately.
 *
 * This is NOT part of `prisma/seed.ts` (which only seeds permissions + the first
 * admin). It is idempotent: it first removes its OWN previously-created test rows
 * (matched by the markers below) and recreates them. It never touches the admin,
 * real users/roles, or real patients.
 *
 * Login: every test user has `mustChangePassword = false` and the password
 * printed at the end, so you can log straight in.
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

loadEnv();
loadEnv({ path: ".env.local", override: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

// argon2id options — must match prisma/seed.ts and src/lib/auth/password.ts.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// --- Markers used to scope idempotent cleanup to THIS script's rows only ---
const TEST_PASSWORD = "ExploreTest123!";
const PATIENT_CODE_PREFIX = "PT-EXP-";

const TEST_ROLES = [
  // Row 1 + bypass: can use Explore AND see sub-threshold cohorts (the default
  // "no restriction" Explore experience).
  {
    name: "Explorer (test)",
    permissions: ["explore.view", "explore.bypassCohortMinimum"],
  },
  // Explore but WITHOUT the bypass — hits the <5-case privacy message. Proves
  // the per-role suppression floor (explore.bypassCohortMinimum ungranted).
  { name: "Explorer No Bypass (test)", permissions: ["explore.view"] },
  // Row 2: a normal non-Explore user (has patient access, NOT explore.view).
  {
    name: "No Explore (test)",
    permissions: ["patient.viewAll", "patient.viewDeidentified"],
  },
  // Row 3: patient DEPTH (sensitive PII) but NO explore.view — proves depth does
  // not grant Explore (decision D3).
  {
    name: "Patient Depth (test)",
    permissions: ["patient.viewAll", "patient.viewSensitive"],
  },
] as const;

const TEST_USERS = [
  { name: "Explorer Test", email: "explorer@example.test", username: "explorer_test", role: "Explorer (test)" },
  { name: "Explorer No-Bypass Test", email: "explorer-nobypass@example.test", username: "explorer_nobypass", role: "Explorer No Bypass (test)" },
  { name: "No-Explore Test", email: "noexplore@example.test", username: "noexplore_test", role: "No Explore (test)" },
  { name: "Depth Test", email: "depth@example.test", username: "depth_test", role: "Patient Depth (test)" },
] as const;

const TEST_USER_EMAILS = TEST_USERS.map((u) => u.email);
const TEST_USERNAMES = TEST_USERS.map((u) => u.username);
const TEST_ROLE_NAMES = TEST_ROLES.map((r) => r.name);

interface PatientSpec {
  code: string;
  gender: "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
  age: number;
  city: string;
  state: string;
  country: string;
  issueTitle: string;
  issueStatus: "ACTIVE" | "RESOLVED" | "CHRONIC" | "RECURRING";
  symptom: string;
  treatments: {
    entryType: "PRESCRIPTION" | "FOLLOW_UP" | "PRESCRIPTION_AND_FOLLOW_UP" | "NOTE";
    medicineName: string;
    potency: string;
    patientCondition: "IMPROVED" | "SAME" | "WORSENED";
    improvementScore: number;
  }[];
}

// Cohort A (8 patients): FEMALE / Springfield, Illinois, USA / 30s / ACTIVE
// migraine / PRESCRIPTION Belladonna 30. Big enough (>=5) that gender=FEMALE,
// ageRange 30-39, state Illinois, issue ACTIVE, treatment PRESCRIPTION all
// return rows, and the Springfield city cohort (8) is retained in the index.
// Cohort B (3 patients): MALE / Riverdale, Texas, USA / 60s / CHRONIC arthritis
// / FOLLOW_UP Rhus Tox 200. Smaller than 5, so gender=MALE / issue=CHRONIC
// suppress, and the Riverdale city cohort (3) is coarsened to state-only.
function buildPatientSpecs(): PatientSpec[] {
  const specs: PatientSpec[] = [];
  for (let i = 1; i <= 8; i++) {
    specs.push({
      code: `${PATIENT_CODE_PREFIX}A${String(i).padStart(2, "0")}`,
      gender: "FEMALE",
      age: 30 + (i % 8), // all within 30-39
      city: "Springfield",
      state: "Illinois",
      country: "USA",
      issueTitle: "Migraine",
      issueStatus: "ACTIVE",
      symptom: "Headache",
      treatments: [
        { entryType: "PRESCRIPTION", medicineName: "Belladonna", potency: "30", patientCondition: "SAME", improvementScore: 4 },
        { entryType: "PRESCRIPTION_AND_FOLLOW_UP", medicineName: "Belladonna", potency: "30", patientCondition: "IMPROVED", improvementScore: 7 },
      ],
    });
  }
  for (let i = 1; i <= 3; i++) {
    specs.push({
      code: `${PATIENT_CODE_PREFIX}B${String(i).padStart(2, "0")}`,
      gender: "MALE",
      age: 60 + i,
      city: "Riverdale",
      state: "Texas",
      country: "USA",
      issueTitle: "Arthritis",
      issueStatus: "CHRONIC",
      symptom: "Joint pain",
      treatments: [
        { entryType: "FOLLOW_UP", medicineName: "Rhus Tox", potency: "200", patientCondition: "SAME", improvementScore: 5 },
      ],
    });
  }
  return specs;
}

async function cleanup() {
  // Patients cascade to CaseRecord/issues/symptoms/treatments.
  const delPatients = await prisma.patient.deleteMany({
    where: { patientCode: { startsWith: PATIENT_CODE_PREFIX } },
  });
  // Users cascade to userRoles + sessions; audit actorUserId is set null.
  const delUsers = await prisma.user.deleteMany({
    where: { OR: [{ email: { in: TEST_USER_EMAILS } }, { username: { in: TEST_USERNAMES } }] },
  });
  // Roles cascade to rolePermissions + any (now-removed) userRoles.
  const delRoles = await prisma.role.deleteMany({
    where: { name: { in: TEST_ROLE_NAMES }, isSystemRole: false },
  });
  console.info(
    `Cleanup: removed ${delPatients.count} test patient(s), ${delUsers.count} test user(s), ${delRoles.count} test role(s).`,
  );
}

async function main() {
  await cleanup();

  // 1. Roles + permission links (permissions must already be seeded).
  const roleIdByName = new Map<string, string>();
  for (const r of TEST_ROLES) {
    const role = await prisma.role.create({
      data: { name: r.name, description: "Phase 8 Explore manual-test role.", isSystemRole: false },
      select: { id: true },
    });
    roleIdByName.set(r.name, role.id);

    const perms = await prisma.permission.findMany({
      where: { key: { in: [...r.permissions] } },
      select: { id: true, key: true },
    });
    if (perms.length !== r.permissions.length) {
      const found = new Set(perms.map((p) => p.key));
      const missing = r.permissions.filter((k) => !found.has(k));
      throw new Error(`Missing permissions ${missing.join(", ")} — run \`pnpm db:seed\` first.`);
    }
    for (const p of perms) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
  }
  console.info(`Created ${TEST_ROLES.length} test role(s).`);

  // 2. Users (login-ready: mustChangePassword = false).
  const passwordHash = await hash(TEST_PASSWORD, ARGON2_OPTIONS);
  for (const u of TEST_USERS) {
    const roleId = roleIdByName.get(u.role)!;
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        username: u.username,
        passwordHash,
        active: true,
        mustChangePassword: false,
        userRoles: { create: { roleId } },
      },
    });
  }
  console.info(`Created ${TEST_USERS.length} test user(s).`);

  // 3. Patients + clinical data.
  const specs = buildPatientSpecs();
  for (const s of specs) {
    const patient = await prisma.patient.create({
      data: {
        patientCode: s.code,
        name: `Test Patient ${s.code}`,
        gender: s.gender,
        age: s.age,
        city: s.city,
        state: s.state,
        country: s.country,
        caseRecord: {
          create: {
            chiefComplaint: s.issueTitle,
            caseDescription: `Test case for ${s.code}.`,
          },
        },
        issues: {
          create: {
            title: s.issueTitle,
            description: `Test issue for ${s.code}.`,
            status: s.issueStatus,
            symptoms: { create: { symptomName: s.symptom, description: "Test symptom." } },
          },
        },
      },
      include: { caseRecord: { select: { id: true } }, issues: { select: { id: true } } },
    });

    const caseRecordId = patient.caseRecord!.id;
    const patientIssueId = patient.issues[0]!.id;
    let day = 1;
    for (const t of s.treatments) {
      await prisma.treatmentEntry.create({
        data: {
          patientId: patient.id,
          caseRecordId,
          patientIssueId,
          entryType: t.entryType,
          medicineName: t.medicineName,
          potency: t.potency,
          patientCondition: t.patientCondition,
          improvementScore: t.improvementScore,
          treatmentDate: new Date(2026, 4, day++), // ordered, same month
        },
      });
    }
  }
  console.info(`Created ${specs.length} test patient(s) with case/issue/symptom/treatment data.`);

  // Explore reads the live `explore_case_view`, so the data above is visible
  // immediately — there is no index to build or refresh.

  console.info("\n--- Test logins (password for all: " + TEST_PASSWORD + ") ---");
  for (const u of TEST_USERS) {
    console.info(`  ${u.username}  (${u.email})  →  role "${u.role}"`);
  }
  console.info("\nCohorts: gender=FEMALE / state=Illinois / age 30-39 / issue ACTIVE / treatment PRESCRIPTION → 8 (>=5, rows; Springfield city kept).");
  console.info("Suppressed (<5): gender=MALE (3), issue status CHRONIC (3); Riverdale city coarsened to state.");
  console.info("Zero-match (also suppressed): country=Canada.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
