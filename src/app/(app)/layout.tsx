import { Suspense } from "react";
import { requireUser } from "@/lib/auth/current-user";
import { ActivityTracker } from "@/components/layout/ActivityTracker";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { CollecteFab } from "@/components/layout/CollecteFab";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceTheme } from "@/components/layout/WorkspaceTheme";
import { WORKSPACE_THEME_CSS } from "@/config/workspace-theme-css";
import { SignataireProvider } from "@/components/transferts/Signataire";
import { prisma } from "@/lib/prisma/client";
import { signataireDe } from "@/lib/transfers/signataire";

// Coquille protégée partagée par tous les modules applicatifs (dashboard,
// collecte, dossiers, qualité, import, export, administration).
// Double protection : `src/proxy.ts` (grossière, par route) + `requireUser()`
// ici (fine, exécutée côté serveur à chaque rendu — cahier des charges §60).
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { fonction: true, signatureData: true } });
  const signataire = { ...signataireDe({ name: session.name, fonction: me?.fonction ?? null, roleCode: session.roleCode }), signature: me?.signatureData ?? null };

  return (
    <WorkspaceTheme roleCode={session.roleCode} permissions={session.permissions}>
      <style>{WORKSPACE_THEME_CSS}</style>
      <SidebarProvider>
        <AppSidebar permissions={session.permissions} roleCode={session.roleCode} />
        <SidebarInset className="bg-transparent">
          <Header name={session.name} email={session.email} roleCode={session.roleCode} />
          <main className="min-h-[calc(100svh-3.5rem)] flex-1 px-3 py-4 pb-24 sm:px-5 sm:pb-6 lg:px-6 lg:py-6">
            <div className="mx-auto w-full max-w-[1600px]"><SignataireProvider value={signataire}>{children}</SignataireProvider></div>
          </main>
        </SidebarInset>
        {session.permissions.includes("DOSSIER_CREATE") && <CollecteFab />}
        <Suspense fallback={null}><ActivityTracker /></Suspense>
      </SidebarProvider>
    </WorkspaceTheme>
  );
}
