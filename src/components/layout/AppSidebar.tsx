"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, type NavItem } from "@/config/navigation";
import type { PermissionCode } from "@/lib/permissions/constants";

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ permissions }: { permissions: PermissionCode[] }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => permissions.includes(item.permission));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {/* Logo CEIBA Analytics réel, non modifié (public/brand/ceiba-analytics-logo.png)
              — affiché sidebar déployée uniquement : au format rail replié
              (~48px carré), le logo complet (large, non carré) ne peut pas
              se lire, on retombe alors sur l'icône seule (fusion des
              petites feuilles par fermeture morphologique, plus lisible
              qu'une réduction du logo complet à cette taille — voir
              public/brand/ceiba-icon-simple.png). */}
          <Image
            src="/brand/ceiba-analytics-logo.png"
            alt="CEIBA Analytics"
            width={960}
            height={531}
            className="h-8 w-auto shrink-0 group-data-[collapsible=icon]:hidden"
            priority
          />
          <Image
            src="/brand/ceiba-icon-simple.png"
            alt="CEIBA Analytics"
            width={28}
            height={28}
            className="hidden h-7 w-7 shrink-0 group-data-[collapsible=icon]:block"
            priority
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">GeoArchives-MULCV</span>
            <span className="text-xs text-muted-foreground">Numérisation &amp; Indexation</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <NavEntry key={item.href} item={item} pathname={pathname} permissions={permissions} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          GeoArchives-MULCV © 2026
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavEntry({ item, pathname, permissions }: { item: NavItem; pathname: string; permissions: PermissionCode[] }) {
  const children = item.children?.filter((c) => permissions.includes(c.permission));
  const active = isActive(pathname, item.href);

  const trigger = (
    <SidebarMenuButton
      isActive={active}
      tooltip={item.title}
      render={
        <Link href={item.href}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      }
    />
  );

  if (!children || children.length === 0) {
    return <SidebarMenuItem>{trigger}</SidebarMenuItem>;
  }

  return (
    <SidebarMenuItem>
      {trigger}
      <SidebarMenuSub>
        {children.map((child) => (
          <SidebarMenuSubItem key={child.href}>
            <SidebarMenuSubButton
              isActive={pathname === child.href}
              render={
                <Link href={child.href}>
                  <span>{child.title}</span>
                </Link>
              }
            />
          </SidebarMenuSubItem>
        ))}
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}
