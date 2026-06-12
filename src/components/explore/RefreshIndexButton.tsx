"use client";

import { useActionState } from "react";
import {
  refreshExploreIndexAction,
  type RefreshExploreState,
} from "@/app/(dashboard)/explore/actions";

/**
 * Admin-only "Refresh Explore index" control (decision D6). Re-projects the
 * de-identified index on demand; the index is otherwise only as fresh as the
 * last rebuild (documented staleness window).
 */
export function RefreshIndexButton() {
  const [state, formAction, pending] = useActionState<
    RefreshExploreState,
    FormData
  >(refreshExploreIndexAction, {});

  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh index"}
      </button>
      {state.message ? (
        <span className="text-sm text-emerald-700">{state.message}</span>
      ) : null}
      {state.error ? (
        <span className="text-sm text-rose-700">{state.error}</span>
      ) : null}
    </form>
  );
}
