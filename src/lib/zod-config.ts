import { z } from 'zod';

// Zod 4 probes `new Function` to compile faster validators. The CSP forbids
// eval, so tell it not to try (avoids a CSP violation report per schema).
z.config({ jitless: true });
