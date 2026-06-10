---
name: ai-privacy-review
description: Review Explore and AI features for de-identification and privacy leakage.
disable-model-invocation: true
---

Review AI/Explore privacy for: $ARGUMENTS

Hard rules:
- AI must use only de-identified records.
- Explore must use only de-identified records.
- Never expose patient name, phone, email, exact address, emergency contact, exact patient ID, exact case ID, doctor name, or raw attachments.
- Prefer age ranges over exact age.
- Prefer broad location if exact location risks identification.
- AI output must include decision-support disclaimer.

Output:
1. Data flow summary
2. PII leakage risks
3. De-identification problems
4. Missing filters/checks
5. Required fixes before production
