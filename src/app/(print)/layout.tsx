import { requireUser } from "@/lib/auth/current-user";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <main className="min-h-screen bg-white p-4 text-slate-950 sm:p-8 print:p-0">{children}</main>;
}
