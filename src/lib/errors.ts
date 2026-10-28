/**
 * Convert Supabase/PostgREST errors into safe Arabic messages.
 * Workflow functions raise Arabic messages intended for users; anything
 * else is mapped to a generic message so internal details never leak.
 */
type MaybePgError = { code?: string; message?: string; status?: number; name?: string } | null | undefined;

const arabic = /[؀-ۿ]/;

export function errorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.'): string {
  const e = error as MaybePgError;
  if (!e) return fallback;
  const msg = e.message ?? '';
  // Messages raised by our own database functions are Arabic and safe.
  if (arabic.test(msg) && msg.length < 300) return msg;
  if (e.name === 'AuthApiError' || /Invalid login credentials/i.test(msg)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (/user is banned/i.test(msg)) return 'تم إيقاف هذا الحساب. يرجى التواصل مع إدارة النظام.';
  if (/JWT expired|session.*(missing|expired)|refresh token/i.test(msg)) return 'انتهت الجلسة، يرجى تسجيل الدخول مجددًا.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'تعذر الاتصال بالخادم. تحقق من الاتصال بالشبكة.';
  switch (e.code) {
    case '23505':
      return 'هذا السجل موجود مسبقًا (قيمة مكررة).';
    case '23503':
      return 'السجل المرتبط غير موجود أو لا يمكن حذفه لارتباطه بسجلات أخرى.';
    case '23514':
    case '22023':
    case '22P02':
      return 'البيانات المدخلة غير صالحة.';
    case '42501':
    case 'PGRST301':
      return 'لا تملك صلاحية تنفيذ هذه العملية.';
    case 'PGRST116':
      return 'السجل غير موجود أو لا تملك صلاحية الوصول إليه.';
    default:
      return fallback;
  }
}

/**
 * Throw if a Supabase response carries an error; otherwise return data.
 * (A successful response's data is only null for maybeSingle() misses,
 * which is already part of T in that case.)
 */
type Success<R> = R extends { error: null } ? R : never;
export function unwrap<R extends { data: unknown; error: unknown }>(res: R): Success<R> extends never ? NonNullable<R['data']> : Success<R>['data'] {
  if (res.error) throw res.error;
  return res.data as never;
}
