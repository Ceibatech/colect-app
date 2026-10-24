"use client";

import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/config/branding";
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
import { getRoleLabel, type PermissionCode, type RoleCode } from "@/lib/permissions/constants";
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
            <span className="truncate text-sm font-semibold text-sidebar-foreground">{BRAND.productName}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">SAE interne CEIBA</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-2 text-xs text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--workspace-role-mark)]" aria-hidden="true" />
          <span>{getRoleLabel(roleCode)}</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1.5 pb-3">
        <SidebarGroup className="gap-1.5 px-1.5 pt-1">
          <SidebarGroupLabel className="h-7 px-2.5 text-[11px] font-medium text-sidebar-foreground/45">
            Modules
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
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
        "relative h-9 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/75 transition-colors [&>svg]:size-[17px] [&>svg]:text-sidebar-foreground/60 hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground hover:[&>svg]:text-sidebar-foreground/85",
        active &&
          "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground [&>svg]:text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground hover:[&>svg]:text-sidebar-primary-foreground"
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
      <SidebarMenuSub className="mx-0 mb-0.5 ml-4 mt-1 gap-0.5 border-sidebar-border/70 px-0 py-0.5 pl-3">
        {children.map((child) => {
          const childActive = pathname === child.href;
          return (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton
                isActive={childActive}
                className={cn(
                  "relative h-8 rounded-md px-2 text-[12.5px] font-medium text-sidebar-foreground/58 transition-colors hover:bg-white/[0.05] hover:text-sidebar-accent-foreground",
                  childActive &&
                    "bg-white/[0.07] font-semibold text-sidebar-accent-foreground before:absolute before:-left-[13px] before:h-4 before:w-0.5 before:rounded-full before:bg-sidebar-primary hover:bg-white/[0.07]"
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
