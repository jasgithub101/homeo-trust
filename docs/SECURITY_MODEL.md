# Security Model

Use dynamic roles and permissions.

Initial system role:
- ADMIN

Admin has all permissions and can create another admin.

Use permission helpers:
- requireUser()
- requirePermission(permissionKey)
- hasPermission(userId, permissionKey)
- canViewSensitivePatient(user, patientId)
- canViewDeidentifiedRecords(user)
- canEditPatient(user, patientId)
- canAddTreatmentEntry(user, patientId)
- canViewAttachment(user, attachmentId)

Never rely only on frontend hiding.
Every sensitive server action must check permissions server-side.
