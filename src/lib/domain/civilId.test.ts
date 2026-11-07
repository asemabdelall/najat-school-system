import { describe, expect, it } from 'vitest';
import { isValidCivilId, normalizeCivilId } from './civilId';

describe('civil ID', () => {
  it('accepts IDs with a correct check digit', () => {
    // Synthetic IDs built to satisfy the checksum (not real people).
    expect(isValidCivilId('300010100018')).toBe(true);
    expect(isValidCivilId('300010100026')).toBe(true);
  });
  it('rejects a wrong check digit, wrong length or non-digits', () => {
    expect(isValidCivilId('300010100019')).toBe(false);
    // Remainder giving 10/11 has no valid check digit.
    expect(isValidCivilId('300010100000')).toBe(false);
    expect(isValidCivilId('30001010000')).toBe(false);
    expect(isValidCivilId('3000101000050')).toBe(false);
    expect(isValidCivilId('30001010000a')).toBe(false);
  });
  it('normalises Arabic-Indic digits, spaces and dashes', () => {
    expect(normalizeCivilId('300 010-100018')).toBe('300010100018');
    expect(normalizeCivilId('۳۰۰۰۱۰۱۰۰۰۱۸')).toBe('300010100018');
  });
});
