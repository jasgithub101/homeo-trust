-- AlterTable
ALTER TABLE "ExploreCaseIndex" ADD COLUMN     "caseMonth" TEXT,
ADD COLUMN     "issueStatuses" "IssueStatus"[],
ADD COLUMN     "potencies" TEXT[],
ADD COLUMN     "treatmentTypes" "TreatmentEntryType"[];

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_caseMonth_idx" ON "ExploreCaseIndex"("caseMonth");
