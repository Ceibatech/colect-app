"use client";

import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuditSearchParams } from "@/lib/validation/audit-search";

export function AuditFilterBar({
  current,
  users,
  actions,
  entities,
}: {
  current: AuditSearchParams;
  users: Array<{ id: number; name: string }>;
  actions: string[];
  entities: string[];
}) {
  return (
    <form method="get" action="/administration/audit" className="space-y-4 rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          Filtres d&apos;audit
        </div>
        <Link href="/administration/audit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <X className="mr-1 h-4 w-4" />
          Réinitialiser
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <NamedSelect
          name="user"
          label="Utilisateur"
          defaultValue={current.user?.toString()}
          options={users.map((u) => ({ value: String(u.id), label: u.name }))}
        />
        <NamedSelect
          name="action"
          label="Action"
          defaultValue={current.action}
          options={actions.map((a) => ({ value: a, label: a }))}
        />
        <NamedSelect
          name="entity"
          label="Entité"
          defaultValue={current.entity}
          options={entities.map((e) => ({ value: e, label: e }))}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">ID entité</label>
          <Input name="entityId" type="number" defaultValue={current.entityId ?? ""} className="h-9 bg-background/70" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Du</label>
          <Input type="date" name="from" defaultValue={current.from ? current.from.toISOString().slice(0, 10) : undefined} className="h-9 bg-background/70" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Au</label>
          <Input type="date" name="to" defaultValue={current.to ? current.to.toISOString().slice(0, 10) : undefined} className="h-9 bg-background/70" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" className="h-9 min-w-28 shadow-sm">Filtrer</Button>
      </div>
    </form>
  );
}

function NamedSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      <Select name={name} items={options} defaultValue={defaultValue}>
        <SelectTrigger className="h-9 w-full bg-background/70">
          <SelectValue placeholder="Tous" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
