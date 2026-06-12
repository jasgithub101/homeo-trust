"use client";

import { useState } from "react";

/**
 * One-time display of a sensitive value (a freshly generated temporary
 * password) that the admin must hand to the user in person.
 *
 * The value lives ONLY in this component's props for the lifetime of the
 * success render — it is never persisted, never logged, and never re-fetchable.
 * Reloading the page loses it by design.
 */
export function OneTimeSecret({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (insecure context); the value is visible
      // on screen regardless, so this is a non-fatal convenience failure.
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-amber-700">
        {note ??
          "Shown once — hand it to the user in person. It won't be shown again."}
      </p>
    </div>
  );
}
