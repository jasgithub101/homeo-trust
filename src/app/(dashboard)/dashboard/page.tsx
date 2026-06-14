import { requireUser, userHasPermission } from "@/lib/auth";
import { listMyUpcomingAppointments } from "@/lib/permissions/patient-access";
import { UpcomingAppointments } from "@/components/appointments/UpcomingAppointments";

export default async function DashboardPage() {
  const user = await requireUser();

  // A2 widget: only for users with a DoctorProfile (incl. a non-doctor admin →
  // no widget) who also hold appointment.view (admin bypasses the permission).
  const showAppointments =
    !!user.doctorProfileId &&
    (user.isAdmin || userHasPermission(user, "appointment.view"));
  const upcoming = showAppointments
    ? await listMyUpcomingAppointments(user)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          Welcome, {user.name}
        </h1>
        <p className="text-sm text-slate-500">
          {user.isAdmin
            ? "You have administrator access."
            : "You are signed in."}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Your access</h2>
        <p className="mt-1 text-sm text-slate-500">
          {user.isAdmin
            ? "Admin — full permissions."
            : user.permissions.size > 0
              ? `${user.permissions.size} permission(s) assigned.`
              : "No permissions assigned yet. An administrator will grant access."}
        </p>
      </div>

      {showAppointments ? <UpcomingAppointments appointments={upcoming} /> : null}
    </div>
  );
}
