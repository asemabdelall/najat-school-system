import { describe, expect, it } from 'vitest';
import { arabicNormalize } from './text';

describe('Arabic normalisation', () => {
  it('unifies common spelling variants', () => {
    expect(arabicNormalize('أحمد')).toBe(arabicNormalize('احمد'));
    expect(arabicNormalize('إبراهيم')).toBe(arabicNormalize('ابراهيم'));
    expect(arabicNormalize('فاطمة')).toBe(arabicNormalize('فاطمه'));
    expect(arabicNormalize('مصطفى')).toBe(arabicNormalize('مصطفي'));
    expect(arabicNormalize('مُحَمَّد')).toBe('محمد');
  });
});
