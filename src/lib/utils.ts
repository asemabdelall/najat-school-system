import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generated RPC argument types mark nullable SQL parameters as non-null.
 * Use this to pass an intentional SQL NULL.
 */
export function sqlNull<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}

/** Trim a string; empty becomes null. */
export function blankToNull(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}
