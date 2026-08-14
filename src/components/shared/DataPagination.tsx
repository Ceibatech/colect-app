import { Fragment } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

function buildHref(basePath: string, searchParams: Record<string, string>, page: number) {
  const params = new URLSearchParams(searchParams);
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

/** Pagination générique server-friendly (liens `<a>`, pas de JS requis) — réutilisée par /dossiers et /administration/audit. */
export function DataPagination({
  basePath,
  page,
  totalPages,
  searchParams,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  searchParams: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={page > 1 ? buildHref(basePath, searchParams, page - 1) : undefined}
            aria-disabled={page <= 1}
          />
        </PaginationItem>
        {sorted.map((p, i) => (
          <Fragment key={p}>
            {i > 0 && sorted[i - 1] !== p - 1 ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            <PaginationItem>
              <PaginationLink href={buildHref(basePath, searchParams, p)} isActive={p === page}>
                {p}
              </PaginationLink>
            </PaginationItem>
          </Fragment>
        ))}
        <PaginationItem>
          <PaginationNext
            href={page < totalPages ? buildHref(basePath, searchParams, page + 1) : undefined}
            aria-disabled={page >= totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
