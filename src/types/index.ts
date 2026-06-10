// Shared application types.
// Clinical types will be added in Phases 2–4.

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
