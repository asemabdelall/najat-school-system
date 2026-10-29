/**
 * In the installed app (standalone), behave like a native app: no pinch or
 * double-tap zoom. The regular browser tab keeps zoom for accessibility.
 */
import { isStandalone } from './standalone';

if (isStandalone()) {
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
  );
  // iOS ignores user-scalable=no; block its pinch gesture events directly.
  const block = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, block, { passive: false });
  // Multi-touch pinch on other engines.
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
}
