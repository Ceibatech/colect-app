import { requireUser } from "@/lib/auth/current-user";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { CollecteFab } from "@/components/layout/CollecteFab";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// Coquille protégée partagée par tous les modules applicatifs (dashboard,
// collecte, dossiers, qualité, import, export, administration).
// Double protection : `src/proxy.ts` (grossière, par route) + `requireUser()`
// ici (fine, exécutée côté serveur à chaque rendu — cahier des charges §60).
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return (
    <SidebarProvider>
      <AppSidebar permissions={session.permissions} />
      <SidebarInset className="bg-transparent">
        <Header name={session.name} email={session.email} roleCode={session.roleCode} />
        <main className="min-h-[calc(100svh-3.5rem)] flex-1 px-3 py-4 pb-24 sm:px-5 sm:pb-6 lg:px-6 lg:py-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </SidebarInset>
      {session.permissions.includes("DOSSIER_CREATE") && <CollecteFab />}
    </SidebarProvider>
  );
}