"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
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
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap overflow-hidden text-xs sm:text-sm">
            <BreadcrumbItem className="hidden shrink-0 sm:block">
              <BreadcrumbLink className="font-medium" render={<Link href="/dashboard">Accueil</Link>} />
            </BreadcrumbItem>
            {crumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                <BreadcrumbSeparator className="hidden shrink-0 sm:block" />
                <BreadcrumbItem className="min-w-0">
                  {i === crumbs.length - 1 ? (
                    <BreadcrumbPage className="block max-w-[52vw] truncate font-medium sm:max-w-[22rem] lg:max-w-none">
                      {crumb.title}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className="block max-w-32 truncate" render={<Link href={crumb.href}>{crumb.title}</Link>} />
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-1.5 rounded-md border border-border/70 bg-card/80 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm lg:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-green" />
          Session sécurisée
        </div>
        <ThemeToggle />
        <UserMenu name={name} email={email} roleCode={roleCode} />
      </div>
    </header>
  );
}