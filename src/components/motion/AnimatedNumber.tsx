import * as React from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { formatNumber } from '@/lib/format';

/**
 * Counts up to `value` (Arabic-Indic digits via ar-KW formatting).
 * Animates only on the first meaningful value and on later changes;
 * renders the final value immediately for reduced-motion users.
 */
export function AnimatedNumber({ value, format = formatNumber, duration = 0.8 }: {
  value: number | null | undefined;
  format?: (n: number) => string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState<number | null>(value ?? null);
  const from = React.useRef(0);

  React.useEffect(() => {
    if (value == null) return;
    if (reduce) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Number.isInteger(value) ? Math.round(v) : Math.round(v * 10) / 10),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce, duration]);

  return <span className="tabular">{value == null || display == null ? '—' : format(display)}</span>;
}
