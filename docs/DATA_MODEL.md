# Data Model

Core rule: do not store doctorId directly as ownership on Patient, CaseRecord, PatientIssue, PatientSymptom, or TreatmentEntry.

Use DoctorPatientRelationship to track patient-doctor assignment history.

Use TreatmentDoctorParticipant to track treating and consulting doctors for treatment entries.

Each patient has exactly one CaseRecord.

Prescription and follow-up are combined into TreatmentEntry.

Patient condition values:
- IMPROVED
- SAME
- WORSENED
