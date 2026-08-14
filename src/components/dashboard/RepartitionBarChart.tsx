"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLOR_SEQUENCE } from "@/lib/utils/chart-colors";

interface RepartitionRow {
  label: string;
  total: number;
}

/**
 * Barres horizontales pour une répartition catégorielle (commune,
 * lotissement, nature, statut...). Une seule série -> une seule teinte
 * (slot 1) ; option `colorByCategory` pour cycler la palette catégorielle
 * fixe quand chaque barre représente une catégorie distincte (ex. statuts).
 */
export function RepartitionBarChart({
  data,
  colorByCategory = false,
  limit = 10,
}: {
  data: RepartitionRow[];
  colorByCategory?: boolean;
  limit?: number;
}) {
  const rows = data.slice(0, limit);

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée.</p>;
  }

  const height = Math.max(200, rows.length * 36);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fontSize: 12, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--popover-foreground)" }}
        />
        <Bar dataKey="total" name="Dossiers" radius={[0, 4, 4, 0]}>
          {rows.map((row, i) => (
            <Cell key={row.label} fill={colorByCategory ? CHART_COLOR_SEQUENCE[i % CHART_COLOR_SEQUENCE.length] : "var(--chart-1)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
