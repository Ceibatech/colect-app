"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  mois: string;
  total: number;
}

/** Évolution mensuelle des anomalies ouvertes (§48 item 12). */
export function AnomaliesEvolutionChart({ data, height = 240 }: { data: Point[]; height?: number }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune anomalie enregistrée.</p>;
  }

  return (
    <div className="min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mois" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--popover-foreground)" }}
          />
          <Bar dataKey="total" name="Anomalies" fill="var(--brand-gold)" radius={[6, 6, 0, 0]} maxBarSize={68} minPointSize={3} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}