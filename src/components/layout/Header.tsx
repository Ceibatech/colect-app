"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { buildBreadcrumb } from "@/lib/utils/breadcrumb";
import type { RoleCode } from "@/lib/permissions/constants";

export function Header({ name, email, roleCode }: { name: string; email: string; roleCode: RoleCode }) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumb(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:block">
              <BreadcrumbLink render={<Link href="/dashboard">Accueil</Link>} />
            </BreadcrumbItem>
            {crumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-2">
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem>
                  {i === crumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href}>{crumb.title}</Link>} />
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu name={name} email={email} roleCode={roleCode} />
      </div>
    </header>
  );
}
