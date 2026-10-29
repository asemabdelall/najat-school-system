import * as React from 'react';
import { m, type HTMLMotionProps } from 'motion/react';
import { riseItem, staggerContainer } from '@/lib/motion';

type Tag = 'div' | 'ul' | 'ol' | 'section';

/** Reveals direct <StaggerItem> children one after another on mount. */
export function Stagger({ as = 'div', stagger, delay, children, ...props }: { as?: Tag; stagger?: number; delay?: number } & HTMLMotionProps<'div'>) {
  const Comp = m[as] as typeof m.div;
  const variants = React.useMemo(() => staggerContainer(stagger, delay), [stagger, delay]);
  return (
    <Comp variants={variants} initial="hidden" animate="show" {...props}>
      {children}
    </Comp>
  );
}

export function StaggerItem({ as = 'div', children, ...props }: { as?: 'div' | 'li' | 'section' } & HTMLMotionProps<'div'>) {
  const Comp = m[as] as typeof m.div;
  return (
    <Comp variants={riseItem} {...props}>
      {children}
    </Comp>
  );
}
