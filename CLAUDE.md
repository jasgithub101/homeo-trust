# Homeo Trust App — Claude Code Instructions

## Core Rule

This is a privacy-sensitive medical/patient management app. Prioritize security, server-side authorization, audit logging, and de-identification.

## Workflow

- Work one phase at a time.
- Before large edits, inspect files and propose a plan.
- Do not overbuild future phases.
- After implementation, summarize files changed, commands to run, manual tests, and risks.

## Architecture Rules

- Use Next.js + TypeScript + PostgreSQL + Prisma unless a better reason is explained.
- Use Zod for validation.
- Use dynamic permissions, not fixed DOCTOR or REGIONAL_HEAD roles.
- Do not store doctorId directly as ownership on Patient, CaseRecord, PatientIssue, PatientSymptom, or TreatmentEntry.
- Use DoctorPatientRelationship for doctor-patient assignment history.
- Use TreatmentDoctorParticipant for treating/consulting doctors.
- Each patient has exactly one CaseRecord.
- Prescription and follow-up are combined into TreatmentEntry.

## Privacy Rules

- Explore and AI must use de-identified records only.
- AI must never access raw patient PII tables directly.
- Never expose patient name, phone, email, exact address, emergency contact, exact patient ID, exact case ID, doctor name, or raw attachments in Explore/AI.
- Attachments are private by default.

## Commands

- Package manager: pnpm
- Run lint: pnpm lint
- Run typecheck: pnpm typecheck
- Run tests: pnpm test
- Run build: pnpm build

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

