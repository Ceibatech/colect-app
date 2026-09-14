"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
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
import { NAV_ITEMS, isNavItemVisible, type NavItem } from "@/config/navigation";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ permissions, roleCode }: { permissions: PermissionCode[]; roleCode: RoleCode }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => isNavItemVisible(item, permissions, roleCode));

  return (
    <Sidebar collapsible="icon" variant="floating" className="border-sidebar-border/70">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-3 rounded-lg border border-sidebar-border/70 bg-white/10 p-2.5 shadow-sm group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-1">
          <Image
            src="/brand/ceiba-analytics-logo.png"
            alt="CEIBA Analytics"
            width={960}
            height={531}
            className="h-9 w-auto shrink-0 rounded-[4px] bg-white px-2 py-1 group-data-[collapsible=icon]:hidden"
            priority
          />
          <Image
            src="/brand/ceiba-icon-simple.png"
            alt="CEIBA Analytics"
            width={32}
            height={32}
            className="hidden h-8 w-8 shrink-0 rounded-md bg-white p-1 group-data-[collapsible=icon]:block"
            priority
          />
          <div className="min-w-0 flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">GeoArchives-MULCV</span>
            <span className="truncate text-xs text-sidebar-foreground/60">Inventaire documentaire</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="gap-2 px-2">
          <SidebarGroupLabel className="text-sidebar-foreground/50">Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map((item) => (
                <NavEntry key={item.href} item={item} pathname={pathname} permissions={permissions} roleCode={roleCode} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

function NavEntry({ item, pathname, permissions, roleCode }: { item: NavItem; pathname: string; permissions: PermissionCode[]; roleCode: RoleCode }) {
  const children = item.children?.filter((child) => isNavItemVisible(child, permissions, roleCode));
  const active = isActive(pathname, item.href);

  const trigger = (
    <SidebarMenuButton
      isActive={active}
      tooltip={item.title}
      className={cn(
        "h-9 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_20px_rgba(0,0,0,0.18)] hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      )}
      render={
        <Link href={item.href} aria-current={active ? "page" : undefined}>
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
      <SidebarMenuSub className="mt-1 border-sidebar-border/60">
        {children.map((child) => {
          const childActive = pathname === child.href;
          return (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton
                isActive={childActive}
                className={cn(
                  "rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
                  childActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                render={
                  <Link href={child.href} aria-current={childActive ? "page" : undefined}>
                    <span>{child.title}</span>
                  </Link>
                }
              />
            </SidebarMenuSubItem>
          );
        })}
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}