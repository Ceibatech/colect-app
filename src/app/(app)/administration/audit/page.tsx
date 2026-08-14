import { requirePermission } from "@/lib/auth/current-user";
import { parseAuditSearchParams } from "@/lib/validation/audit-search";
import { searchAuditLogs, getAuditFacets, AUDIT_PAGE_SIZE } from "@/lib/services/audit-service";
import { AuditFilterBar } from "@/components/administration/AuditFilterBar";
import { AuditTable, type AuditLogRowView } from "@/components/administration/AuditTable";
import { DataPagination } from "@/components/shared/DataPagination";

export const metadata = { title: "Audit — Administration" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("AUDIT_VIEW");
  const rawParams = await searchParams;
  const params = parseAuditSearchParams(rawParams);

  const [facets, results] = await Promise.all([
    getAuditFacets(),
    searchAuditLogs(
      {
        userId: params.user,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        dateFrom: params.from,
        dateTo: params.to,
      },
      { page: params.page, pageSize: AUDIT_PAGE_SIZE }
    ),
  ]);

  const rows: AuditLogRowView[] = results.items.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt.toISOString(),
    oldValue: r.oldValue,
    newValue: r.newValue,
    user: r.user,
  }));

  const flatSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string" && value) flatSearchParams[key] = value;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">
          {results.total} événement{results.total > 1 ? "s" : ""} — page {results.page} / {results.totalPages}
        </p>
      </div>

      <AuditFilterBar current={params} users={facets.users} actions={facets.actions} entities={facets.entities} />

      <AuditTable rows={rows} />

      <DataPagination basePath="/administration/audit" page={results.page} totalPages={results.totalPages} searchParams={flatSearchParams} />
    </div>
  );
}
