/**
 * Arabic-aware normalisation for client-side matching. Mirrors the SQL
 * function public.ar_normalize(): strips diacritics/tatweel and unifies
 * alef forms, taa marbuta→haa, alef maqsura→yaa.
 */
export function arabicNormalize(value: string): string {
  return value
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .toLowerCase();
}
