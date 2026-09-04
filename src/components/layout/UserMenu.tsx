"use client";

import Link from "next/link";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/services/auth-service";
import type { RoleCode } from "@/lib/permissions/constants";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserMenu({ name, email, roleCode }: { name: string; email: string; roleCode: RoleCode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card/80 px-1.5 pr-2 text-sm shadow-sm transition-colors hover:bg-accent/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            aria-label="Menu utilisateur"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-32 truncate font-medium sm:inline">{name}</span>
            <Badge variant="secondary" className="hidden rounded-md border border-border/60 bg-muted/70 font-semibold sm:inline-flex">
              {roleCode}
            </Badge>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{name}</span>
              <span className="text-xs font-normal text-muted-foreground">{email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/compte" />}>
          <UserIcon className="mr-2 h-4 w-4" />
          Mon compte
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => logoutAction()}>
          <LogOut className="mr-2 h-4 w-4" />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}