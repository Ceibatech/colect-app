import { requireUser } from "@/lib/auth/current-user";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
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
      <SidebarInset>
        <Header name={session.name} email={session.email} roleCode={session.roleCode} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
