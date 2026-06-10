# Development Phases

## Phase 1: Project setup
- Inspect repo
- Set up Next.js + TypeScript
- Set up Tailwind
- Set up app layout
- Set up env structure
- Set up database foundation
- Do not build full app yet

## Phase 2: Authentication and first admin
- Login/logout
- Session handling
- First admin seed
- Admin role seed
- Initial permissions seed
- First-login password change flow

## Phase 3: Dynamic permissions and roles
- Role table
- Permission table
- RolePermission table
- UserRole table
- Permission helpers
- Admin UI for roles/permissions

## Phase 4: Core clinical schema
- DoctorProfile
- Patient
- CaseRecord
- PatientIssue
- PatientSymptom
- DoctorPatientRelationship
- TreatmentEntry
- TreatmentDoctorParticipant
- PatientAttachment
- AuditLog
- AISearchLog
- ExploreCaseIndex

## Phase 5: Patient management
- Create patient
- Assign doctor
- Transfer patient
- End treatment relationship
- View assignment history

## Phase 6: Case, issue, symptom, treatment workflow
- One CaseRecord per patient
- Multiple issues
- Multiple symptoms
- TreatmentEntry for prescription/follow-up
- Patient timeline

## Phase 7: Attachments
- Upload photos/reports
- Private storage
- Signed URLs
- Audit attachment access

## Phase 8: Explore page
- De-identified records
- Filters
- No PII exposure

## Phase 9: AI similarity assistant
- De-identified retrieval only
- Embeddings/vector search if useful
- PII filter
- AI logs

## Phase 10: Security, testing, polish
- Permission tests
- Privacy tests
- Attachment tests
- AI privacy tests
- Production readiness
