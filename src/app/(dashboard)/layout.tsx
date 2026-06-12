import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { canAccessPatientsSection } from "@/lib/permissions/patient-access";
import { canUseExplore } from "@/lib/permissions/explore-access";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side gate (middleware is only a UX cookie check).
  const user = await requireUser();

  // Enforce the forced password change before any dashboard access.
  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <AppShell
      user={{
        name: user.name,
        isAdmin: user.isAdmin,
        canViewPatients: canAccessPatientsSection(user),
        canUseExplore: canUseExplore(user),
      }}
    >
      {children}
    </AppShell>
  );
}
