"use client";

import { useActionState, useState } from "react";
import {
  resetUserPasswordAction,
  type ResetPasswordState,
} from "@/app/(dashboard)/admin/users/[userId]/actions";
import { OneTimeSecret } from "@/components/ui/OneTimeSecret";

/**
 * Admin "Reset password" control. Two-step (reveal a confirm row) so a reset —
 * which signs the target out everywhere and forces a password change — isn't a
 * single misclick. On success the temp password is shown ONCE via OneTimeSecret.
 */
export function ResetPasswordButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetUserPasswordAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.tempPassword) {
    return (
      <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-700">
          Temporary password set for <strong>{state.username ?? userName}</strong>.
          They must set a new password on next login, and all their other sessions
          have been signed out.
        </p>
        <OneTimeSecret label="Temporary password" value={state.tempPassword} />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? (
        <p className="text-sm text-rose-700">{state.error}</p>
      ) : null}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">
            Reset {userName}&rsquo;s password and sign them out everywhere?
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? "Resetting…" : "Confirm reset"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Reset password
        </button>
      )}
    </form>
  );
}
