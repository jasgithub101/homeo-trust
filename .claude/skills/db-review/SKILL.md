---
name: db-review
description: Review database schema and migrations for the Homeo Trust app.
disable-model-invocation: true
---

Review the database work for: $ARGUMENTS

Focus on:
- No direct doctorId ownership on Patient, CaseRecord, PatientIssue, PatientSymptom, or TreatmentEntry
- DoctorPatientRelationship correctly tracks assignment history
- TreatmentDoctorParticipant correctly tracks treating/consulting doctors
- One CaseRecord per Patient
- TreatmentEntry combines prescription and follow-up
- PatientCondition supports only IMPROVED, SAME, WORSENED
- ExploreCaseIndex is de-identified
- Proper indexes, unique constraints, and deletion behavior
- No destructive migration without explicit approval

Output:
1. Correct parts
2. Problems
3. Missing constraints/indexes
4. Privacy concerns
5. Recommended fixes
