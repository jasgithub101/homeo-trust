# Graph Report - homeo-trust  (2026-06-11)

## Corpus Check
- 135 files · ~60,180 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 973 nodes · 1747 edges · 71 communities (47 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e6816da8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Patient Management Actions & Forms|Patient Management Actions & Forms]]
- [[_COMMUNITY_Session & Rate-Limit Auth|Session & Rate-Limit Auth]]
- [[_COMMUNITY_Graphify Pipeline & Outputs|Graphify Pipeline & Outputs]]
- [[_COMMUNITY_Prisma, Audit & Mailer Infrastructure|Prisma, Audit & Mailer Infrastructure]]
- [[_COMMUNITY_Role & Permission Management UI|Role & Permission Management UI]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Dashboard Shell & Current User|Dashboard Shell & Current User]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Clinical Data Model|Clinical Data Model]]
- [[_COMMUNITY_AI & Explore Privacy Model|AI & Explore Privacy Model]]
- [[_COMMUNITY_Patient Access Control & Display|Patient Access Control & Display]]
- [[_COMMUNITY_Schema Ownership Rules (Phase 4)|Schema Ownership Rules (Phase 4)]]
- [[_COMMUNITY_Security & Authorization Model|Security & Authorization Model]]
- [[_COMMUNITY_Auth Foundation Decisions (Phase 2)|Auth Foundation Decisions (Phase 2)]]
- [[_COMMUNITY_Development Phases & Planning|Development Phases & Planning]]
- [[_COMMUNITY_Dynamic RBAC Decisions (Phase 3)|Dynamic RBAC Decisions (Phase 3)]]
- [[_COMMUNITY_Tech Stack & Master Spec|Tech Stack & Master Spec]]
- [[_COMMUNITY_Route Protection Proxy|Route Protection Proxy]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Action Result Type|Action Result Type]]
- [[_COMMUNITY_Graphify Directive|Graphify Directive]]
- [[_COMMUNITY_SVGGraphML Export|SVG/GraphML Export]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]

## God Nodes (most connected - your core abstractions)
1. `requireUser()` - 58 edges
2. `writeAuditLog()` - 40 edges
3. `db` - 40 edges
4. `Homeo Trust Web Application — Master Specification` - 35 edges
5. `Data Model Spec` - 25 edges
6. `permittedAndRelated()` - 18 edges
7. `userHasPermission()` - 17 edges
8. `requireAdminAccess()` - 16 edges
9. `compilerOptions` - 16 edges
10. `Phase 3 Report — Dynamic Roles & Permissions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Homeo Trust Claude Code Instructions` --references--> `pnpm Workspace Config`  [INFERRED]
  CLAUDE.md → pnpm-workspace.yaml
- `NewRolePage()` --calls--> `requireAdminAccess()`  [INFERRED]
  src/app/(dashboard)/admin/roles/new/page.tsx → src/lib/permissions/check.ts
- `EditSymptomPage()` --calls--> `canEditSymptom()`  [INFERRED]
  src/app/(dashboard)/patients/[patientId]/issues/[issueId]/symptoms/[symptomId]/edit/page.tsx → src/lib/permissions/patient-access.ts
- `NewSymptomPage()` --calls--> `canCreateSymptom()`  [INFERRED]
  src/app/(dashboard)/patients/[patientId]/issues/[issueId]/symptoms/new/page.tsx → src/lib/permissions/patient-access.ts
- `Homeo Trust Claude Code Instructions` --references--> `No doctorId Ownership Rule`  [EXTRACTED]
  CLAUDE.md → docs/DATA_MODEL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **De-identified Explore/AI Data Flow** — ai_privacy_model_spec_deidentification_principle, data_model_spec_explorecaseindex, ai_privacy_model_spec_explore_page, ai_privacy_model_spec_ai_assistant, ai_privacy_model_spec_pii_filter [EXTRACTED 0.90]
- **Configurable RBAC Core Models** — data_model_spec_user, data_model_spec_role, data_model_spec_permission, data_model_spec_rolepermission, data_model_spec_userrole [EXTRACTED 0.90]
- **History-Not-Ownership Doctor-Patient Pattern** — data_model_spec_no_doctorid_ownership, data_model_spec_doctorpatientrelationship, data_model_spec_treatmentdoctorparticipant, data_model_spec_doctorprofile [EXTRACTED 0.90]
- **Two-Phase Extraction Flow (AST + Semantic + Merge)** — graphify_skill_ast_extraction, graphify_skill_semantic_extraction, graphify_skill_semantic_cache, graphify_skill_build_graph [EXTRACTED 0.90]
- **Graph Navigation Surface (query/path/explain)** — references_query_query_flow, references_query_query_expansion, references_query_bfs_dfs, references_query_save_result [EXTRACTED 0.90]
- **Subagent Extraction Rule Set** — references_extraction_spec_subagent_prompt, references_extraction_spec_node_id_format, references_extraction_spec_confidence_rubric, references_extraction_spec_calls_direction [EXTRACTED 0.85]

## Communities (71 total, 24 thin omitted)

### Community 0 - "Patient Management Actions & Forms"
Cohesion: 0.10
Nodes (19): assignDoctorAction(), endRelationshipAction(), PatientActionState, transferPatientAction(), PatientDetailPage(), prettyGender(), AssignDoctorForm(), initialState (+11 more)

### Community 1 - "Session & Rate-Limit Auth"
Cohesion: 0.05
Nodes (44): AUDIT_ACTIONS, AuditAction, AuditInput, Bucket, buckets, checkLoginRateLimit(), RateLimitResult, resetLoginRateLimit() (+36 more)

### Community 2 - "Graphify Pipeline & Outputs"
Cohesion: 0.06
Nodes (42): AST Structural Extraction (Part A), Build Graph & Cluster (Step 4), Community Detection / Clustering, Cost Tracker (cost.json), Detect Files (graphify.detect), Fast Path (existing graph query), Gemini Backend (extract_corpus_parallel), God Nodes (+34 more)

### Community 3 - "Prisma, Audit & Mailer Infrastructure"
Cohesion: 0.10
Nodes (27): initialState, RoleAssignmentForm(), RoleOption, loadIssueOptions(), TreatmentEntryForm(), EditIssuePage(), EditTreatmentPage(), createPrismaClient() (+19 more)

### Community 4 - "Role & Permission Management UI"
Cohesion: 0.08
Nodes (29): DeleteRoleButton(), initialState, Group, initialState, PermDef, PermissionMatrix(), initialState, RoleForm() (+21 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.05
Nodes (37): dependencies, next, @node-rs/argon2, nodemailer, pg, @prisma/adapter-pg, @prisma/client, react (+29 more)

### Community 6 - "Dashboard Shell & Current User"
Cohesion: 0.07
Nodes (36): RootPage(), logoutAction(), CurrentUser, getCurrentUser, requireUser(), userHasPermission(), destroyCurrentSession(), ChangePasswordForm() (+28 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "Clinical Data Model"
Cohesion: 0.19
Nodes (19): Data Model Spec, AuditLog Model, CaseRecord Model, DoctorPatientRelationship Model, DoctorProfile Model, One CaseRecord Per Patient Rule, Partial Unique Index for Current Primary Doctor, Patient Model (+11 more)

### Community 9 - "AI & Explore Privacy Model"
Cohesion: 0.16
Nodes (14): AI & Explore Privacy Model Spec, AI Similarity Assistant, De-identified-Records-Only Principle, Explore Page Feature, Post-Generation PII/Privacy Filter, Homeo Trust Claude Code Instructions, Phase-by-Phase Workflow Rule, Privacy-First Medical App Principle (+6 more)

### Community 10 - "Patient Access Control & Display"
Cohesion: 0.05
Nodes (42): 10. Manual testing checklist, 11. Problems faced and fixes, 12. What I should understand from this phase, 13. Resume / interview talking points, 14. Next recommended phase, 1. Phase overview, 2. Architecture decisions, 3. Database / schema changes (+34 more)

### Community 11 - "Schema Ownership Rules (Phase 4)"
Cohesion: 0.29
Nodes (5): No doctorId Ownership Rule, Model History Not Ownership Principle, Schema-Only Phase Decision, Shadow-DB P3014 Migrate-Diff Workaround, Phase 4 Core Clinical Database Schema

### Community 12 - "Security & Authorization Model"
Cohesion: 0.22
Nodes (10): Preferred Tech Stack (Next.js/Prisma/Postgres), Master Specification, PostgreSQL Cloud-Agnostic Database, Prisma ORM Choice, Security Model Spec, Last-Admin Lockout Protection, ADMIN Initial System Role, Audit Logging Requirements (+2 more)

### Community 13 - "Auth Foundation Decisions (Phase 2)"
Cohesion: 0.47
Nodes (5): Session Model, argon2id Password Hashing, HMAC Session Token Storage, Forced First-Login Password Change, Custom Opaque Session Decision

### Community 14 - "Development Phases & Planning"
Cohesion: 0.18
Nodes (9): Optional DoctorProfile Decision, Permissions Recomputed Per Request, RBAC-as-Data Decision, Development Phases Spec, Phase 1 Project Setup, Phase 2 Authentication & First Admin, Phase 3 Dynamic Permissions & Roles, Phase 5 Patient Management (+1 more)

### Community 15 - "Dynamic RBAC Decisions (Phase 3)"
Cohesion: 0.11
Nodes (26): date(), toIssueScalars(), createIssueAction(), revalidateIssue(), updateIssueAction(), ArchiveInput, archiveSchema, CaseRecordInput (+18 more)

### Community 16 - "Tech Stack & Master Spec"
Cohesion: 0.13
Nodes (19): ArchiveAction, ArchiveButton(), initialState, initialState, FormMessages(), SelectField(), SubmitButton(), TextAreaField() (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (33): 0. Core Data-Modeling Rules (must hold across the whole schema), 10. Explore Case Index (de-identified), 11. AI Search Log, 12. Audit Log, 13. Combined Clinical Behavior (relationships summary), 1. Access-Control Models, 2. Doctor-Patient Relationship, 3. Patient (+25 more)

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Knowledge Graph (+18 more)

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (26): 10. Important files changed, 11. Manual testing checklist, 12. Problems faced and fixes, 13. What I should understand from this phase, 14. Resume / interview talking points, 15. Next recommended phase, 1. Phase overview, 2. Architecture decisions (+18 more)

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (15): toPatientScalars(), txt(), ASSIGNABLE_RELATIONSHIP_TYPES, AssignDoctorInput, assignDoctorSchema, CreatePatientInput, createPatientSchema, EndRelationshipInput (+7 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (22): 10. Important files changed, 11. Manual verification checklist, 12. Problems faced and fixes, 13. What I should understand from this phase, 14. Resume / interview talking points, 15. Next recommended phase, 1. Phase overview, 2. Architecture decisions (+14 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (22): 16. Treatment Doctor Participants, 18. Combined Clinical Behavior, 19. Explore Page, 1. Project Overview, 20. Explore Privacy Requirements, 22. AI Feature, 23. Critical AI Privacy Requirements, 27. Admin Dashboard (+14 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (18): 1. Permission-Based Access Model, 2. Initial System Role — ADMIN, 3. User Onboarding Security, 4. Example Permissions, 5. Authorization Helpers, 6. Audit Logging, 7. Security Requirements, AI (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (13): Coding Rules (apply to every phase), Development Phases, Phase 10: Security, Testing, and Polish, Phase 1: Project Setup, Phase 2: Authentication and First Admin, Phase 3: Dynamic Permissions and Roles, Phase 4: Core Clinical Database Schema, Phase 5: Patient Management and Doctor-Patient Relationships (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.08
Nodes (23): 10. Manual test checklist, 11. Problems faced and fixes, 12. What I should understand from this phase, 13. Resume / interview talking points, 14. Next recommended phase, 1. Phase overview, 2. Architecture decisions, 3. Access-control model (the core of Phase 5) (+15 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (10): 26. Authorization Helpers, canAddTreatmentEntry(user, patientId), canCreateCase(user, patientId), canDeleteCase(user, patientId), canEditPatient(user, patientId), canViewAttachment(user, attachmentId), canViewDeidentifiedRecords(user), canViewSensitivePatient(user, patientId) (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (11): 1. Project Overview, 2. Preferred Tech Stack, 3. Core System Concept, 4. User Onboarding, 5. Admin Dashboard, 6. Doctor Dashboard, 7. Patient Workflow, 8. Forms and Validation (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.23
Nodes (17): IssueForm(), IssueStatusBadge(), STYLES, IssueDetailPage(), archiveIssueAction(), archiveSymptomAction(), IssuesPage(), NewIssuePage() (+9 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (11): 33. Development Phases, Phase 10: Security, Testing, and Polish, Phase 1: Project Setup, Phase 2: Authentication and First Admin, Phase 3: Dynamic Permissions and Roles, Phase 4: Core Clinical Database Schema, Phase 5: Patient Management and Doctor-Patient Relationships, Phase 6: Case, Issue, Symptom, and Treatment Workflow (+3 more)

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (11): 8. Example Permissions, AI, Attachments, Audit, Case, Explore, Issue, Patient (+3 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (9): 1. Explore Page, 2. Explore Privacy Requirements, 3. Recommended Explore Dataset — ExploreCaseIndex, 4. AI Feature, 5. Critical AI Privacy Requirements, 6. AI Architecture, AI & Explore Privacy Model, AISearchLog (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (13): ClinicalNav(), Tab, TABS, label(), participantLabels(), ParticipantRow, buildTimeline(), TimelineEvent (+5 more)

### Community 43 - "Community 43"
Cohesion: 0.22
Nodes (8): Always maintain rolling handoff, Architecture Rules, Commands, Core Rule, graphify, Homeo Trust App — Claude Code Instructions, Privacy Rules, Workflow

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (7): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (7): 6. Main Access-Control Data Models, DoctorProfile, Permission, Role, RolePermission, User, UserRole

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 47 - "Community 47"
Cohesion: 0.26
Nodes (13): writeAuditLog(), toTreatmentScalars(), prettyEnum(), canAddTreatmentEntry(), canArchiveTreatment(), canEditTreatment(), canViewTreatments(), TreatmentDetailPage() (+5 more)

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 50 - "Community 50"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 60 - "Community 60"
Cohesion: 0.22
Nodes (10): EditPatientPage(), updatePatientAction(), EditPatientForm(), initialState, GENDERS, PatientDefaults, PatientFields(), canEditPatient() (+2 more)

### Community 62 - "Community 62"
Cohesion: 0.23
Nodes (10): upsertCaseRecordAction(), CasePage(), CaseRecordDefaults, CaseRecordForm(), toCaseScalars(), CaseEditPage(), canCreateCase(), canEditCase() (+2 more)

### Community 68 - "Community 68"
Cohesion: 0.22
Nodes (10): toSymptomScalars(), txt(), initialState, SymptomDefaults, SymptomForm(), EditSymptomPage(), createSymptomAction(), loadIssueForSymptom() (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.17
Nodes (11): 10. What NOT to do next, 1. Project status by phase, 2. What is implemented (Phases 1–5), 3. Committed vs uncommitted, 4. Database / migration status, 5. Important architecture rules, 6. Known limitation (design gap to revisit), 7. Current immediate task (+3 more)

## Knowledge Gaps
- **439 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+434 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requireUser()` connect `Dashboard Shell & Current User` to `Patient Management Actions & Forms`, `Session & Rate-Limit Auth`, `Prisma, Audit & Mailer Infrastructure`, `Community 68`, `Community 38`, `Community 42`, `Dynamic RBAC Decisions (Phase 3)`, `Community 47`, `Community 30`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `db` connect `Prisma, Audit & Mailer Infrastructure` to `Patient Management Actions & Forms`, `Session & Rate-Limit Auth`, `Role & Permission Management UI`, `Community 68`, `Dashboard Shell & Current User`, `Community 38`, `Community 42`, `Dynamic RBAC Decisions (Phase 3)`, `Community 47`, `Community 30`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `writeAuditLog()` connect `Community 47` to `Patient Management Actions & Forms`, `Session & Rate-Limit Auth`, `Prisma, Audit & Mailer Infrastructure`, `Community 68`, `Role & Permission Management UI`, `Community 38`, `Dashboard Shell & Current User`, `Dynamic RBAC Decisions (Phase 3)`, `Community 30`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _451 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Patient Management Actions & Forms` be split into smaller, more focused modules?**
  _Cohesion score 0.09885057471264368 - nodes in this community are weakly interconnected._
- **Should `Session & Rate-Limit Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.05478750640040963 - nodes in this community are weakly interconnected._
- **Should `Graphify Pipeline & Outputs` be split into smaller, more focused modules?**
  _Cohesion score 0.05574912891986063 - nodes in this community are weakly interconnected._