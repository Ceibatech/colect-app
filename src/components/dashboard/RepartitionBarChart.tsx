import type { CSSProperties } from "react";
import { CHART_COLOR_SEQUENCE } from "@/lib/utils/chart-colors";

interface RepartitionRow {
  label: string;
  total: number;
}

/**
 * Ranked horizontal bars for categorical distributions. The layout is built
 * with CSS rather than chart axes so long labels remain readable on mobile.
 */
export function RepartitionBarChart({
  data,
  colorByCategory = false,
  limit = 10,
  height,
  leftAxisWidth = 120,
  barSize = 14,
}: {
  data: RepartitionRow[];
  colorByCategory?: boolean;
  limit?: number;
  height?: number;
  leftAxisWidth?: number;
  barSize?: number;
}) {
  const rows = data.slice(0, limit);

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune donn&eacute;e.</p>;
  }

  const maxValue = Math.max(...rows.map((row) => row.total), 1);
  const aggregate = rows.reduce((sum, row) => sum + row.total, 0);
  const chartStyle = {
    "--chart-label-width": String(Math.max(leftAxisWidth, 96)) + "px",
    "--chart-bar-height": String(Math.max(10, Math.min(barSize, 18))) + "px",
    minHeight: height ? Math.max(height - 32, 0) : undefined,
  } as CSSProperties;

  return (
    <div className="flex min-w-0 flex-col justify-center gap-4" style={chartStyle}>
      {rows.map((row, index) => {
        const width = row.total > 0 ? Math.max((row.total / maxValue) * 100, 3) : 0;
        const share = aggregate > 0 ? Math.round((row.total / aggregate) * 100) : 0;
        const color = colorByCategory ? CHART_COLOR_SEQUENCE[index % CHART_COLOR_SEQUENCE.length] : "var(--chart-1)";

        return (
          <div
            key={row.label + "-" + index}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[var(--chart-label-width)_minmax(0,1fr)_4.5rem]"
          >
            <div className="flex min-w-0 items-start gap-2 sm:justify-end">
              <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="line-clamp-2 text-xs font-medium leading-4 text-foreground sm:text-right" title={row.label}>
                {row.label}
              </span>
            </div>

            <div
              className="col-span-2 h-[var(--chart-bar-height)] overflow-hidden rounded-sm bg-muted/70 ring-1 ring-inset ring-border/40 sm:col-span-1"
              role="img"
              aria-label={row.label + ": " + row.total + " dossiers, " + share + "% de la s\u00e9lection"}
            >
              <div
                className="h-full rounded-sm transition-[width] duration-500"
                style={{ width: String(width) + "%", backgroundColor: color }}
              />
            </div>

            <div className="row-start-1 flex items-baseline justify-end gap-1.5 sm:col-start-3">
              <span className="text-sm font-semibold tabular-nums text-foreground">{row.total}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{share}%</span>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span>{rows.length} cat&eacute;gories affich&eacute;es</span>
        <span className="font-medium tabular-nums text-foreground">Total {aggregate}</span>
      </div>
    </div>
  );
}
