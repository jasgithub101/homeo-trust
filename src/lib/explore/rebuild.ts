/**
 * Idempotent rebuild of ExploreCaseIndex from the raw clinical tables (Phase 8,
 * decision D6). This is the ONLY writer of the index; Explore/AI only ever read
 * it. De-identification happens entirely via `projectPatient` — this module
 * just orchestrates the DB I/O.
 *
 * Pure of `server-only` so it can be called from BOTH the node rebuild script
 * (its own PrismaClient) and the admin "Refresh Explore index" server action
 * (the request `db`). Accepts the client as a parameter to keep it reusable.
 *
 * Rules (D6):
 * - Excludes patients without a CaseRecord.
 * - Excludes archived (deletedAt != null) issues/symptoms/treatments at
 *   projection time, so the index reflects live clinical data only.
 * - Upserts by patientId; the CSPRNG anonymousCaseCode is generated ONCE on
 *   create and preserved across rebuilds (never recomputed from ids).
 * - Deletes index rows whose patient no longer qualifies (case removed, etc.).
 *
 * Staleness window: there are no on-write hooks yet, so the index is only as
 * fresh as the last rebuild/refresh. Documented as a known limitation.
 */
import type { PrismaClient } from "@prisma/client";
import { EXPLORE_MIN_COHORT } from "./constants";
import {
  generateAnonymousCaseCode,
  locationCityKey,
  projectPatient,
  type RawPatientForProjection,
} from "./projection";

export interface RebuildResult {
  scanned: number;
  upserted: number;
  deleted: number;
  /** Number of distinct city cohorts large enough to keep the city. */
  citiesKept: number;
}

export async function rebuildExploreIndex(
  prisma: PrismaClient,
): Promise<RebuildResult> {
  // 1. Load qualifying patients (must have a CaseRecord) with NON-ARCHIVED
  //    issues/symptoms/treatments only. We pull only the fields projection
  //    needs — never PII like name/phone/email/address/emergency contact.
  const patients = await prisma.patient.findMany({
    where: { caseRecord: { isNot: null } },
    select: {
      id: true,
      age: true,
      gender: true,
      city: true,
      state: true,
      country: true,
      caseRecord: { select: { id: true, createdAt: true } },
      issues: {
        where: { deletedAt: null },
        select: {
          title: true,
          status: true,
          symptoms: {
            where: { deletedAt: null },
            select: { symptomName: true },
          },
        },
      },
      treatmentEntries: {
        where: { deletedAt: null },
        select: {
          medicineName: true,
          potency: true,
          entryType: true,
          patientCondition: true,
          improvementScore: true,
          treatmentDate: true,
        },
      },
    },
  });

  // 2. Size city cohorts across the qualifying set; a city is only retained
  //    when at least EXPLORE_MIN_COHORT patients share it (else coarsen to
  //    state). This is what makes city values k-anonymous in the index.
  const cityCounts = new Map<string, number>();
  for (const p of patients) {
    const key = locationCityKey(p.country, p.state, p.city);
    if (key) cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
  }
  const allowedCities = new Set<string>();
  for (const [key, count] of cityCounts) {
    if (count >= EXPLORE_MIN_COHORT) allowedCities.add(key);
  }

  // 3. Project + upsert each patient. anonymousCaseCode is create-only.
  let upserted = 0;
  for (const p of patients) {
    const raw: RawPatientForProjection = {
      age: p.age,
      gender: p.gender,
      city: p.city,
      state: p.state,
      country: p.country,
      caseRecordCreatedAt: p.caseRecord?.createdAt ?? null,
      issues: p.issues.map((i) => ({ title: i.title, status: i.status })),
      symptoms: p.issues.flatMap((i) => i.symptoms),
      treatments: p.treatmentEntries,
    };
    const projection = projectPatient(raw, { allowedCities });

    await prisma.exploreCaseIndex.upsert({
      where: { patientId: p.id },
      update: { caseRecordId: p.caseRecord?.id ?? null, ...projection },
      create: {
        patientId: p.id,
        caseRecordId: p.caseRecord?.id ?? null,
        anonymousCaseCode: generateAnonymousCaseCode(),
        ...projection,
      },
    });
    upserted += 1;
  }

  // 4. Drop index rows whose patient no longer qualifies.
  const keepIds = patients.map((p) => p.id);
  const { count: deleted } = await prisma.exploreCaseIndex.deleteMany({
    where: { patientId: { notIn: keepIds } },
  });

  return {
    scanned: patients.length,
    upserted,
    deleted,
    citiesKept: allowedCities.size,
  };
}
