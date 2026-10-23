export const EMAIL_REPORT_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type EmailReportFrequency = (typeof EMAIL_REPORT_FREQUENCIES)[number];

export interface EmailReportSchedule {
  frequency: EmailReportFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  hourUtc: number;
}

/**
 * Abidjan uses UTC year-round. Keeping the persisted hour in UTC makes the
 * scheduler deterministic and avoids timezone drift inside Docker.
 */
export function computeNextEmailReportAt(schedule: EmailReportSchedule, after = new Date()): Date {
  const hour = Math.min(23, Math.max(0, Math.trunc(schedule.hourUtc)));
  const candidate = new Date(Date.UTC(
    after.getUTCFullYear(),
    after.getUTCMonth(),
    after.getUTCDate(),
    hour,
    0,
    0,
    0,
  ));

  if (schedule.frequency === "DAILY") {
    if (candidate <= after) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }

  if (schedule.frequency === "WEEKLY") {
    const requestedDay = Math.min(7, Math.max(1, Math.trunc(schedule.dayOfWeek))) % 7;
    const delta = (requestedDay - candidate.getUTCDay() + 7) % 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    if (candidate <= after) candidate.setUTCDate(candidate.getUTCDate() + 7);
    return candidate;
  }

  const requestedDate = Math.min(28, Math.max(1, Math.trunc(schedule.dayOfMonth)));
  candidate.setUTCDate(requestedDate);
  if (candidate <= after) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1, requestedDate);
  }
  return candidate;
}

export function emailReportFrequencyLabel(frequency: EmailReportFrequency): string {
  return {
    DAILY: "Chaque jour",
    WEEKLY: "Chaque semaine",
    MONTHLY: "Chaque mois",
  }[frequency];
}
