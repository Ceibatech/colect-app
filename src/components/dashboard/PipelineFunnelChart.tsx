"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLOR_SEQUENCE } from "@/lib/utils/chart-colors";

interface FunnelRow {
  etape: string;
  total: number;
}

/**
 * Pipeline global (§48 item 6) : nombre de dossiers ayant atteint chaque
 * étape, du plus large (Collecte) au plus étroit (Archivage). Barres
 * horizontales plutôt qu'un vrai "funnel" Recharts — plus lisible et
 * cohérent avec les autres graphiques de répartition. Chaque étape reprend
 * la couleur de sa série dans les graphiques d'évolution (ordre fixe).
 */
export function PipelineFunnelChart({ data }: { data: FunnelRow[] }) {
  if (data.every((d) => d.total === 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucun dossier.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="etape"
          width={100}
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
          {data.map((row, i) => (
            <Cell key={row.etape} fill={CHART_COLOR_SEQUENCE[i % CHART_COLOR_SEQUENCE.length]} />
          ))}
          <LabelList dataKey="total" position="right" style={{ fill: "var(--foreground)", fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
