-- AlterTable
ALTER TABLE "PatientAttachment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletionReason" TEXT;

-- CreateIndex
CREATE INDEX "PatientAttachment_deletedAt_idx" ON "PatientAttachment"("deletedAt");
