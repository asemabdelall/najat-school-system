/**
 * Motion tokens shared by every animated surface, so the whole app moves
 * with one rhythm. Durations are short (UI, not cinema) and all transforms
 * are disabled automatically for users who prefer reduced motion
 * (MotionConfig reducedMotion="user" in main.tsx).
 */
import type { Transition, Variants } from 'motion/react';

/** Expo-out: fast start, soft landing. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const spring = {
  /** Panels, sheets, drawers */
  sheet: { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } satisfies Transition,
  /** Shared-layout indicators (active nav pill, status pills) */
  indicator: { type: 'spring', stiffness: 520, damping: 38 } satisfies Transition,
  /** Small pops (badges, checkmarks) */
  pop: { type: 'spring', stiffness: 600, damping: 26 } satisfies Transition,
};

export const duration = { fast: 0.14, base: 0.22, slow: 0.36 };

/** Route-level page transition. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.995 },
  enter: { opacity: 1, y: 0, scale: 1, transition: { duration: duration.slow, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: duration.fast, ease: EASE_IN_OUT } },
};

/** Parent that reveals its children one after another. */
export function staggerContainer(stagger = 0.045, delay = 0.02): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
}

/** Child of a stagger container. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: EASE_OUT } },
};

/** Table rows: lighter, quicker reveal suited to dense data. */
export const rowItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: EASE_OUT } },
};

export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: duration.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: EASE_IN_OUT } },
};
