/// <reference types="vite-plugin-pwa/react" />
import * as React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, PlusSquare, RefreshCw, Share, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { spring } from '@/lib/motion';
import { isStandalone } from './standalone';

// ---------------------------------------------------------------------
// Install prompt. `beforeinstallprompt` can fire before React mounts, so
// it is captured at module load and shared through a tiny store.
// ---------------------------------------------------------------------
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own, better-timed prompt
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export { isStandalone };

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}

export function useInstallPrompt() {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => void listeners.delete(force);
  }, []);
  const ios = typeof navigator !== 'undefined' && isIosSafari() && !isStandalone();
  return {
    available: Boolean(deferred) || ios,
    ios,
    async prompt() {
      if (deferred) {
        const e = deferred;
        await e.prompt();
        await e.userChoice.catch(() => undefined);
        deferred = null;
        emit();
      } else if (ios) {
        window.dispatchEvent(new Event('najat:ios-install-guide'));
      }
    },
  };
}

const DISMISS_KEY = 'najat-install-dismissed-at';
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function IosInstallGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="تثبيت التطبيق على iPhone / iPad" description="ثلاث خطوات من متصفح Safari" size="sm">
        <ol className="space-y-4 text-sm">
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand dark:text-link"><Share className="size-4" aria-hidden /></span>
            اضغط زر <strong>المشاركة</strong> أسفل الشاشة (أو أعلاها في iPad).
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand dark:text-link"><PlusSquare className="size-4" aria-hidden /></span>
            اختر <strong>«إضافة إلى الشاشة الرئيسية»</strong>.
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand dark:text-link"><Smartphone className="size-4" aria-hidden /></span>
            اضغط <strong>«إضافة»</strong>، وسيظهر تطبيق «النجاة» بجانب تطبيقاتك.
          </li>
        </ol>
        <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>حسنًا</Button>
      </DialogContent>
    </Dialog>
  );
}

/** Floating card used for both "update available" and "install app". */
function PromptCard({ icon, title, body, action, onAction, onClose, busy }: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <m.div
      role="status"
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.98, transition: { duration: 0.16 } }}
      transition={spring.sheet}
      className="glass fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border p-4 shadow-lg sm:bottom-6 sm:start-6 sm:end-auto sm:mx-0"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg text-white [background:var(--brand-gradient-deep)] [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-fg-strong">{title}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{body}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onAction} loading={busy}>{action}</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>لاحقًا</Button>
        </div>
      </div>
      <button className="rounded-md p-1 text-fg-muted hover:bg-surface-hover" onClick={onClose} aria-label="إغلاق">
        <X className="size-4" />
      </button>
    </m.div>
  );
}

export function PwaPrompts() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every 30 minutes while the app is open.
      if (registration) setInterval(() => void registration.update().catch(() => {}), 30 * 60_000);
    },
  });
  const [updating, setUpdating] = React.useState(false);
  const install = useInstallPrompt();
  const [installOpen, setInstallOpen] = React.useState(false);
  const [iosGuide, setIosGuide] = React.useState(false);

  // Offer installation once, a little after sign-in, on devices that support it.
  React.useEffect(() => {
    if (!install.available || isStandalone() || recentlyDismissed()) return;
    const t = setTimeout(() => setInstallOpen(true), 4000);
    return () => clearTimeout(t);
  }, [install.available]);

  React.useEffect(() => {
    const open = () => setIosGuide(true);
    window.addEventListener('najat:ios-install-guide', open);
    return () => window.removeEventListener('najat:ios-install-guide', open);
  }, []);

  const dismissInstall = () => {
    setInstallOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage blocked — the card simply shows again next visit */
    }
  };

  return (
    <>
      <AnimatePresence>
        {needRefresh ? (
          <PromptCard
            key="update"
            icon={<RefreshCw />}
            title="يتوفر إصدار جديد من النظام"
            body="احفظ أي عمل مفتوح ثم حدّث للحصول على آخر التحسينات."
            action="تحديث الآن"
            busy={updating}
            onAction={() => {
              setUpdating(true);
              void updateServiceWorker(true);
            }}
            onClose={() => setNeedRefresh(false)}
          />
        ) : installOpen ? (
          <PromptCard
            key="install"
            icon={<Download />}
            title="ثبّت تطبيق النجاة على جهازك"
            body="فتح أسرع من الشاشة الرئيسية، بملء الشاشة، مع اختصارات لرصد الحضور ورفع البلاغات."
            action={install.ios ? 'كيفية التثبيت' : 'تثبيت'}
            onAction={() => {
              setInstallOpen(false);
              void install.prompt();
            }}
            onClose={dismissInstall}
          />
        ) : null}
      </AnimatePresence>
      <IosInstallGuide open={iosGuide} onOpenChange={setIosGuide} />
    </>
  );
}
