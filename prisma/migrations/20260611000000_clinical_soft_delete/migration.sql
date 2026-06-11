-- AlterTable
ALTER TABLE "PatientIssue" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "PatientSymptom" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "TreatmentEntry" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletionReason" TEXT;

-- CreateIndex
CREATE INDEX "PatientIssue_deletedAt_idx" ON "PatientIssue"("deletedAt");

-- CreateIndex
CREATE INDEX "PatientSymptom_deletedAt_idx" ON "PatientSymptom"("deletedAt");

-- CreateIndex
CREATE INDEX "TreatmentEntry_deletedAt_idx" ON "TreatmentEntry"("deletedAt");
