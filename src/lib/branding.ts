/**
 * User-facing application display name. Single source of truth for branding
 * strings shown to users (shell, auth pages, emails). This is DISPLAY text only
 * — it is intentionally separate from the package/repo/database name and from
 * any code identifier, which keep the internal working name.
 *
 * Plain module (no `server-only`) so it can be imported from server components,
 * client components, and server actions alike.
 */

/** Full product name. Use for primary branding, headings, email signature. */
export const APP_NAME = "Pujya Sai Master Homeo Vaidyalayam";

/** Short product name. Use in tight spots (browser tab, email subject). */
export const APP_NAME_SHORT = "Sai Master Homeo";
