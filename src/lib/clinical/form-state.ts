/**
 * Shared server-action result shape for Phase 6 clinical forms. Mirrors the
 * Phase 5 `PatientActionState` so clinical forms reuse the same render pattern
 * (field errors + top-level error/success).
 */
export interface ClinicalActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}
