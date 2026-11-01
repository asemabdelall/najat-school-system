/**
 * Kuwaiti civil ID helpers. Mirrors public.is_valid_civil_id() in the
 * database (the database is the boundary; this gives instant feedback).
 */
const WEIGHTS = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];

/** Arabic-Indic / Persian digits → ASCII, and strips spaces and dashes. */
export function normalizeCivilId(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s-]/g, '');
}

export function isValidCivilId(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(value[i]), 0);
  return 11 - (sum % 11) === Number(value[11]);
}
