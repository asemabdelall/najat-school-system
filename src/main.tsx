import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Direction, Tooltip } from 'radix-ui';
import { Toaster } from 'sonner';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import { AuthProvider } from '@/auth/AuthProvider';
import { App } from './App';
import { PwaPrompts } from '@/pwa/PwaPrompts';
import '@/pwa/lockZoom';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => {
        const code = (error as { code?: string })?.code;
        if (code === '42501' || code === 'PGRST116' || code === 'PGRST301') return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* strict: components must use `m.*` so only the loaded feature set ships. */}
      <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
      <Direction.Provider dir="rtl">
        <Tooltip.Provider delayDuration={300}>
          <AuthProvider>
            <App />
          </AuthProvider>
          <PwaPrompts />
          <Toaster dir="rtl" position="bottom-left" richColors closeButton toastOptions={{ style: { fontFamily: 'inherit' } }} />
        </Tooltip.Provider>
      </Direction.Provider>
      </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  </StrictMode>,
);
