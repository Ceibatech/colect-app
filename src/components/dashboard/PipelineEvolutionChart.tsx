"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS } from "@/lib/utils/chart-colors";

interface PipelinePoint {
  mois: string;
  collecte: number;
  validation: number;
  numerisation: number;
  indexation: number;
  archivage: number;
}

const SERIES: Array<{ key: keyof Omit<PipelinePoint, "mois">; label: string; color: string }> = [
  { key: "collecte", label: "Collecte", color: CHART_COLORS.collecte },
  { key: "validation", label: "Validation", color: CHART_COLORS.validation },
  { key: "numerisation", label: "Numérisation", color: CHART_COLORS.numerisation },
  { key: "indexation", label: "Indexation", color: CHART_COLORS.indexation },
  { key: "archivage", label: "Archivage", color: CHART_COLORS.archivage },
];

/**
 * Évolution mensuelle combinée des 5 étapes du pipeline (§48 items 1-5).
 * Un seul axe Y (nombre de dossiers) — jamais de double axe.
 */
export function PipelineEvolutionChart({ data }: { data: PipelinePoint[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="mois" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--popover-foreground)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
