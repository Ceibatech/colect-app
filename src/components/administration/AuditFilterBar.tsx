"use client";

import Link from "next/link";
import { X } from "lucide-react";
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
    <form method="get" action="/administration/audit" className="space-y-3 rounded-lg border bg-background p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">ID entité</label>
          <Input name="entityId" type="number" defaultValue={current.entityId ?? ""} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" name="from" defaultValue={current.from ? current.from.toISOString().slice(0, 10) : undefined} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" name="to" defaultValue={current.to ? current.to.toISOString().slice(0, 10) : undefined} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit">Filtrer</Button>
        <Link href="/administration/audit" className={buttonVariants({ variant: "ghost" })}>
          <X className="mr-1 h-4 w-4" />
          Réinitialiser
        </Link>
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
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select name={name} items={options} defaultValue={defaultValue}>
        <SelectTrigger className="w-full">
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
