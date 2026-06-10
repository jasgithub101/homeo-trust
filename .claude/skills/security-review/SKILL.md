---
name: security-review
description: Review current implementation for authorization, sensitive data exposure, and audit logging.
disable-model-invocation: true
---

Review security for: $ARGUMENTS

Focus on:
- Missing server-side authorization
- Frontend-only permission checks
- PII leakage
- Unsafe logs
- Missing audit logs
- Attachment access risks
- Admin lockout risks
- Weak validation
- Unsafe database queries

Output:
1. Critical issues
2. High-risk issues
3. Medium-risk issues
4. Low-risk issues
5. Concrete fixes
