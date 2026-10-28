import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { KeyRound, MoreVertical, Plus, Search, ShieldMinus, ShieldPlus, UserCheck, UserCog, UserX } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RoleBadge } from '@/components/ui/status-badges';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { qk, useStaff, type StaffMember } from '@/lib/queries';
import { ROLE_LABELS, ROLES, type Role } from '@/lib/domain/permissions';
import { arabicNormalize } from '@/lib/text';

/** Call the admin-users Edge Function (service role stays server-side). */
async function adminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'تعذر تنفيذ العملية');
    }
    throw new Error('تعذر الاتصال بخدمة إدارة الحسابات. تأكد من نشر الدالة admin-users.');
  }
  return data;
}

const passwordOk = (p: string) => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ full_name: '', email: '', password: '', roles: ['teacher'] as Role[] });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) { setV({ full_name: '', email: '', password: '', roles: ['teacher'] }); setError(null); }
  }, [open]);
  const create = useMutation({ mutationFn: () => adminUsers({ action: 'create', ...v }), onSuccess: () => void qc.invalidateQueries({ queryKey: qk.staff }) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="إضافة مستخدم" description="يُنشأ الحساب مفعّلًا. سلّم كلمة المرور المؤقتة للموظف عبر قناة آمنة واطلب تغييرها." size="md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (v.full_name.trim().length < 2) return setError('الاسم مطلوب');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return setError('البريد الإلكتروني غير صالح');
            if (!passwordOk(v.password)) return setError('كلمة المرور: ١٠ أحرف على الأقل وتتضمن حروفًا وأرقامًا');
            if (!v.roles.length) return setError('اختر صلاحية واحدة على الأقل');
            try {
              await create.mutateAsync();
              toast.success('تم إنشاء الحساب');
              onOpenChange(false);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <Field label="الاسم الكامل" htmlFor="u-name" required><Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></Field>
          <Field label="البريد الإلكتروني" htmlFor="u-email" required><Input type="email" dir="ltr" className="text-start" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="كلمة مرور مؤقتة" htmlFor="u-pass" required hint="١٠ أحرف على الأقل، حروف وأرقام."><Input type="text" dir="ltr" className="text-start" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-semibold">الصلاحيات</legend>
            <div className="flex flex-wrap gap-4">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={v.roles.includes(r)} onChange={(e) => setV({ ...v, roles: e.target.checked ? [...v.roles, r] : v.roles.filter((x) => x !== r) })} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" loading={create.isPending}>إنشاء الحساب</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Pending =
  | { kind: 'grant' | 'revoke'; user: StaffMember; role: Role }
  | { kind: 'deactivate' | 'activate'; user: StaffMember }
  | { kind: 'password'; user: StaffMember };

export function UsersPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const staff = useStaff();
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [newPassword, setNewPassword] = React.useState('');

  const act = useMutation({
    mutationFn: async (p: Pending) => {
      switch (p.kind) {
        case 'grant':
          return unwrap(await supabase.from('user_roles').insert({ user_id: p.user.id, role: p.role }).select('user_id'));
        case 'revoke': {
          const rows = unwrap(await supabase.from('user_roles').delete().eq('user_id', p.user.id).eq('role', p.role).select('user_id'));
          if (!rows.length) throw { code: '42501' };
          return rows;
        }
        case 'activate':
        case 'deactivate':
          return adminUsers({ action: 'set_active', user_id: p.user.id, active: p.kind === 'activate' });
        case 'password':
          return adminUsers({ action: 'reset_password', user_id: p.user.id, password: newPassword });
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.staff }),
  });

  const term = arabicNormalize(search.trim());
  const rows = (staff.data ?? []).filter((s) => !term || arabicNormalize(s.full_name).includes(term) || (s.email ?? '').toLowerCase().includes(term));
  const confirmText: Record<Pending['kind'], string> = { grant: 'منح الصلاحية', revoke: 'سحب الصلاحية', activate: 'تفعيل الحساب', deactivate: 'تعطيل الحساب', password: 'تعيين كلمة المرور' };

  return (
    <>
      <PageHeader title="المستخدمون والصلاحيات" description="حسابات الموظفين وصلاحياتهم. لا يوجد تسجيل ذاتي." actions={<Button onClick={() => setCreateOpen(true)}><Plus /> إضافة مستخدم</Button>} />
      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input type="search" aria-label="بحث بالاسم أو البريد" className="ps-9" placeholder="بحث بالاسم أو البريد" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {staff.isPending ? <LoadingState /> : staff.isError ? <ErrorState error={staff.error} onRetry={() => staff.refetch()} /> : rows.length === 0 ? <EmptyState icon={<UserCog />} title="لا يوجد مستخدمون مطابقون" /> : (
          <Table caption="المستخدمون">
            <THead><Tr><Th>الاسم</Th><Th className="hidden md:table-cell">البريد</Th><Th>الصلاحيات</Th><Th>الحالة</Th><Th><span className="sr-only">إجراءات</span></Th></Tr></THead>
            <TBody>
              {rows.map((u) => {
                const self = u.id === profile?.id;
                return (
                  <Tr key={u.id}>
                    <Td className="font-semibold">{u.full_name}{self && <span className="ms-1 text-xs font-normal text-fg-muted">(أنت)</span>}</Td>
                    <Td className="hidden text-fg-muted md:table-cell"><span className="ltr">{u.email}</span></Td>
                    <Td><div className="flex flex-wrap gap-1">{u.roles.length ? u.roles.map((r) => <RoleBadge key={r} role={r} />) : <Badge tone="outline">بلا صلاحيات</Badge>}</div></Td>
                    <Td>{u.is_active ? <Badge tone="success"><UserCheck aria-hidden /> مفعّل</Badge> : <Badge tone="neutral"><UserX aria-hidden /> معطّل</Badge>}</Td>
                    <Td className="text-end">
                      <DropdownMenu dir="rtl">
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`إجراءات ${u.full_name}`}><MoreVertical /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                            <DropdownMenuItem key={`g-${r}`} onSelect={() => setPending({ kind: 'grant', user: u, role: r })}><ShieldPlus /> منح صلاحية {ROLE_LABELS[r]}</DropdownMenuItem>
                          ))}
                          {u.roles.filter((r) => !(self && r === 'admin')).map((r) => (
                            <DropdownMenuItem key={`r-${r}`} onSelect={() => setPending({ kind: 'revoke', user: u, role: r })}><ShieldMinus /> سحب صلاحية {ROLE_LABELS[r]}</DropdownMenuItem>
                          ))}
                          {!self && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => { setNewPassword(''); setPending({ kind: 'password', user: u }); }}><KeyRound /> تعيين كلمة مرور جديدة</DropdownMenuItem>
                              {u.is_active ? (
                                <DropdownMenuItem className="text-danger [&_svg]:text-danger" onSelect={() => setPending({ kind: 'deactivate', user: u })}><UserX /> تعطيل الحساب</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => setPending({ kind: 'activate', user: u })}><UserCheck /> تفعيل الحساب</DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? `${confirmText[pending.kind]} — ${pending.user.full_name}` : ''}
        description={
          pending?.kind === 'password' ? (
            <div className="space-y-2">
              <p>ستُستبدل كلمة المرور الحالية. سلّم الجديدة للموظف بشكل آمن.</p>
              <Input aria-label="كلمة المرور الجديدة" dir="ltr" className="text-start" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="١٠ أحرف على الأقل، حروف وأرقام" />
            </div>
          ) : pending?.kind === 'deactivate' ? 'لن يتمكن الموظف من تسجيل الدخول، وتُوقف صلاحياته فورًا. تبقى سجلاته التاريخية محفوظة.'
          : pending?.kind === 'grant' || pending?.kind === 'revoke' ? `صلاحية «${ROLE_LABELS[pending.role]}». يُسجَّل التغيير في سجل التدقيق ويُشعَر الموظف.`
          : 'سيتمكن الموظف من تسجيل الدخول بصلاحياته الحالية.'
        }
        confirmLabel={pending ? confirmText[pending.kind] : ''}
        tone={pending?.kind === 'deactivate' || pending?.kind === 'revoke' ? 'danger' : 'primary'}
        loading={act.isPending}
        onConfirm={async () => {
          if (pending?.kind === 'password' && !passwordOk(newPassword)) return toast.error('كلمة المرور: ١٠ أحرف على الأقل وتتضمن حروفًا وأرقامًا');
          try {
            await act.mutateAsync(pending!);
            toast.success('تم تنفيذ العملية');
            setPending(null);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
