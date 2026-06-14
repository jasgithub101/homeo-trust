/**
 * ONE-TIME backfill — TreatmentEntry.nextFollowUpDate → FOLLOW_UP Appointment
 * (Feature A1.5). Run AFTER deploying the A1.5 code (the timeline now reads
 * appointments and has no column fallback).
 *
 *   pnpm exec tsx scripts/backfill-followup-appointments.ts
 *
 * For each non-archived TreatmentEntry with a non-null nextFollowUpDate, create
 * one linked FOLLOW_UP appointment (allDay, SCHEDULED, createdByUserId: null —
 * system). We do NOT fabricate COMPLETED: we don't know whether the visit
 * happened; the dashboard's `scheduledAt >= now` filter hides past ones.
 *
 * Idempotent + non-destructive: skip a treatment if ANY appointment (including
 * soft-deleted) already links its id — so re-running never duplicates and never
 * resurrects a manually-cleared follow-up. NOT part of prisma/seed.ts.
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnv();
loadEnv({ path: ".env.local", override: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

async function main() {
  const treatments = await prisma.treatmentEntry.findMany({
    where: { nextFollowUpDate: { not: null }, deletedAt: null },
    select: { id: true, patientId: true, nextFollowUpDate: true },
  });

  let created = 0;
  let skipped = 0;
  for (const te of treatments) {
    const existing = await prisma.appointment.findFirst({
      where: { treatmentEntryId: te.id }, // incl. soft-deleted → no dupe, no resurrect
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.appointment.create({
      data: {
        patientId: te.patientId,
        treatmentEntryId: te.id,
        scheduledAt: te.nextFollowUpDate!,
        allDay: true,
        type: "FOLLOW_UP",
        status: "SCHEDULED",
        createdByUserId: null,
      },
    });
    created += 1;
  }

  console.info(
    `Backfill complete: created ${created} FOLLOW_UP appointment(s); ` +
      `skipped ${skipped} treatment(s) already linked.`,
  );
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
