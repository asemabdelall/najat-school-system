/** Academic-year helpers (year-end close, archive). */
export type ClosePreview = {
  year_id: string | null;
  year_name: string;
  starts_on: string;
  ends_on: string;
  enrolled_students: number;
  by_grade: Record<string, number>;
  classes: number;
  draft_sessions: number;
  pending_incidents: number;
  open_follow_ups: number;
  pending_excuses: number;
};

/**
 * Suggests the next year from the current one: "2026/2027" → "2027/2028",
 * starting on the second Sunday of September after the current year ends
 * and ending on 10 June of the following year (editable in the wizard).
 */
export function suggestNextYear(currentName: string, currentEnds: string): { name: string; starts_on: string; ends_on: string } {
  const m = /^(\d{4})\s*[/\-–]\s*(\d{4})$/.exec(currentName.trim());
  const endYear = Number(currentEnds.slice(0, 4));
  const a = m ? Number(m[2]) : endYear;
  const startYear = Math.max(a, endYear);
  const sept1 = new Date(Date.UTC(startYear, 8, 1));
  const firstSunday = 1 + ((7 - sept1.getUTCDay()) % 7);
  const start = new Date(Date.UTC(startYear, 8, firstSunday + 7));
  let starts_on = start.toISOString().slice(0, 10);
  if (starts_on <= currentEnds) {
    const next = new Date(Date.parse(`${currentEnds}T00:00:00Z`) + 86_400_000);
    starts_on = next.toISOString().slice(0, 10);
  }
  return { name: `${startYear}/${startYear + 1}`, starts_on, ends_on: `${startYear + 1}-06-10` };
}

export const YEAR_STATUS_LABELS: Record<string, string> = { planned: 'مخطط', active: 'نشط', closed: 'مغلق (أرشيف)' };
