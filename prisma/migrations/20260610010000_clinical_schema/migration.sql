-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('PRIMARY_TREATING', 'CONSULTING', 'ASSISTING', 'TRANSFERRED_FROM', 'TRANSFERRED_TO');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CHRONIC', 'RECURRING');

-- CreateEnum
CREATE TYPE "TreatmentEntryType" AS ENUM ('PRESCRIPTION', 'FOLLOW_UP', 'PRESCRIPTION_AND_FOLLOW_UP', 'NOTE');

-- CreateEnum
CREATE TYPE "PatientCondition" AS ENUM ('IMPROVED', 'SAME', 'WORSENED');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('TREATING_DOCTOR', 'CONSULTING_DOCTOR');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('ISSUE_PHOTO', 'LAB_REPORT', 'SCAN_REPORT', 'PRESCRIPTION_IMAGE', 'OTHER');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "patientCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "age" INTEGER,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "occupation" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactRelation" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "caseDescription" TEXT NOT NULL,
    "medicalHistory" TEXT,
    "familyHistory" TEXT,
    "physicalGenerals" TEXT,
    "mentalGenerals" TEXT,
    "modalities" TEXT,
    "diagnosisNotes" TEXT,
    "repertoryNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientIssue" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "onsetDate" TIMESTAMP(3),
    "status" "IssueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSymptom" (
    "id" TEXT NOT NULL,
    "patientIssueId" TEXT NOT NULL,
    "symptomName" TEXT NOT NULL,
    "description" TEXT,
    "severity" INTEGER,
    "duration" TEXT,
    "modalities" TEXT,
    "triggers" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientSymptom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPatientRelationship" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "isCurrentlyTreating" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPatientRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "caseRecordId" TEXT NOT NULL,
    "patientIssueId" TEXT,
    "treatmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryType" "TreatmentEntryType" NOT NULL,
    "medicineName" TEXT,
    "potency" TEXT,
    "dosage" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "followUpNotes" TEXT,
    "symptomChanges" TEXT,
    "patientCondition" "PatientCondition",
    "improvementScore" INTEGER,
    "nextFollowUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentDoctorParticipant" (
    "id" TEXT NOT NULL,
    "treatmentEntryId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "participantType" "ParticipantType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentDoctorParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAttachment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientIssueId" TEXT,
    "caseRecordId" TEXT,
    "treatmentEntryId" TEXT,
    "uploadedByUserId" TEXT,
    "fileType" "AttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "description" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExploreCaseIndex" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "caseRecordId" TEXT,
    "anonymousCaseCode" TEXT NOT NULL,
    "ageRange" TEXT,
    "gender" "Gender",
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "issueSummaries" TEXT[],
    "symptomSummaries" TEXT[],
    "medicineSummaries" TEXT[],
    "patientConditionSummary" TEXT,
    "improvementTrend" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExploreCaseIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISearchLog" (
    "id" TEXT NOT NULL,
    "requestingUserId" TEXT,
    "deidentifiedQueryText" TEXT NOT NULL,
    "deidentifiedResponse" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_patientCode_key" ON "Patient"("patientCode");

-- CreateIndex
CREATE INDEX "Patient_createdAt_idx" ON "Patient"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseRecord_patientId_key" ON "CaseRecord"("patientId");

-- CreateIndex
CREATE INDEX "PatientIssue_patientId_idx" ON "PatientIssue"("patientId");

-- CreateIndex
CREATE INDEX "PatientIssue_status_idx" ON "PatientIssue"("status");

-- CreateIndex
CREATE INDEX "PatientSymptom_patientIssueId_idx" ON "PatientSymptom"("patientIssueId");

-- CreateIndex
CREATE INDEX "DoctorPatientRelationship_patientId_idx" ON "DoctorPatientRelationship"("patientId");

-- CreateIndex
CREATE INDEX "DoctorPatientRelationship_doctorProfileId_idx" ON "DoctorPatientRelationship"("doctorProfileId");

-- CreateIndex
CREATE INDEX "TreatmentEntry_patientId_idx" ON "TreatmentEntry"("patientId");

-- CreateIndex
CREATE INDEX "TreatmentEntry_caseRecordId_idx" ON "TreatmentEntry"("caseRecordId");

-- CreateIndex
CREATE INDEX "TreatmentEntry_patientIssueId_idx" ON "TreatmentEntry"("patientIssueId");

-- CreateIndex
CREATE INDEX "TreatmentEntry_treatmentDate_idx" ON "TreatmentEntry"("treatmentDate");

-- CreateIndex
CREATE INDEX "TreatmentDoctorParticipant_doctorProfileId_idx" ON "TreatmentDoctorParticipant"("doctorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentDoctorParticipant_treatmentEntryId_doctorProfileId_key" ON "TreatmentDoctorParticipant"("treatmentEntryId", "doctorProfileId", "participantType");

-- CreateIndex
CREATE INDEX "PatientAttachment_patientId_idx" ON "PatientAttachment"("patientId");

-- CreateIndex
CREATE INDEX "PatientAttachment_patientIssueId_idx" ON "PatientAttachment"("patientIssueId");

-- CreateIndex
CREATE INDEX "PatientAttachment_caseRecordId_idx" ON "PatientAttachment"("caseRecordId");

-- CreateIndex
CREATE INDEX "PatientAttachment_treatmentEntryId_idx" ON "PatientAttachment"("treatmentEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExploreCaseIndex_patientId_key" ON "ExploreCaseIndex"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ExploreCaseIndex_anonymousCaseCode_key" ON "ExploreCaseIndex"("anonymousCaseCode");

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_gender_idx" ON "ExploreCaseIndex"("gender");

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_ageRange_idx" ON "ExploreCaseIndex"("ageRange");

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_city_idx" ON "ExploreCaseIndex"("city");

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_state_idx" ON "ExploreCaseIndex"("state");

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_country_idx" ON "ExploreCaseIndex"("country");

-- CreateIndex
CREATE INDEX "ExploreCaseIndex_patientConditionSummary_idx" ON "ExploreCaseIndex"("patientConditionSummary");

-- CreateIndex
CREATE INDEX "AISearchLog_requestingUserId_idx" ON "AISearchLog"("requestingUserId");

-- CreateIndex
CREATE INDEX "AISearchLog_createdAt_idx" ON "AISearchLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CaseRecord" ADD CONSTRAINT "CaseRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientIssue" ADD CONSTRAINT "PatientIssue_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSymptom" ADD CONSTRAINT "PatientSymptom_patientIssueId_fkey" FOREIGN KEY ("patientIssueId") REFERENCES "PatientIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientRelationship" ADD CONSTRAINT "DoctorPatientRelationship_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientRelationship" ADD CONSTRAINT "DoctorPatientRelationship_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientRelationship" ADD CONSTRAINT "DoctorPatientRelationship_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentEntry" ADD CONSTRAINT "TreatmentEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentEntry" ADD CONSTRAINT "TreatmentEntry_caseRecordId_fkey" FOREIGN KEY ("caseRecordId") REFERENCES "CaseRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentEntry" ADD CONSTRAINT "TreatmentEntry_patientIssueId_fkey" FOREIGN KEY ("patientIssueId") REFERENCES "PatientIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentDoctorParticipant" ADD CONSTRAINT "TreatmentDoctorParticipant_treatmentEntryId_fkey" FOREIGN KEY ("treatmentEntryId") REFERENCES "TreatmentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentDoctorParticipant" ADD CONSTRAINT "TreatmentDoctorParticipant_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAttachment" ADD CONSTRAINT "PatientAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAttachment" ADD CONSTRAINT "PatientAttachment_patientIssueId_fkey" FOREIGN KEY ("patientIssueId") REFERENCES "PatientIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAttachment" ADD CONSTRAINT "PatientAttachment_caseRecordId_fkey" FOREIGN KEY ("caseRecordId") REFERENCES "CaseRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAttachment" ADD CONSTRAINT "PatientAttachment_treatmentEntryId_fkey" FOREIGN KEY ("treatmentEntryId") REFERENCES "TreatmentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAttachment" ADD CONSTRAINT "PatientAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExploreCaseIndex" ADD CONSTRAINT "ExploreCaseIndex_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISearchLog" ADD CONSTRAINT "AISearchLog_requestingUserId_fkey" FOREIGN KEY ("requestingUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual Postgres artifact: Prisma cannot express partial (WHERE) indexes.
-- Enforces at most one current PRIMARY_TREATING doctor per patient.
CREATE UNIQUE INDEX "dpr_one_current_primary_per_patient"
  ON "DoctorPatientRelationship" ("patientId")
  WHERE "relationshipType" = 'PRIMARY_TREATING' AND "isCurrentlyTreating" = true;
