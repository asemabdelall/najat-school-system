import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarRange, Flag, Pencil, Plus, Settings2, Star } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/format';
import { qk, useAcademicYears, useBehaviorCategories, useSchoolSettings, type AcademicYear, type SchoolSettings } from '@/lib/queries';
import { SEVERITY_LABELS, type Severity } from '@/lib/domain/behavior';
import type { Tables } from '@/lib/database.types';

function SchoolSettingsForm({ settings }: { settings: SchoolSettings }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [v, setV] = React.useState(settings);
  const [confirmMode, setConfirmMode] = React.useState(false);
  React.useEffect(() => setV(settings), [settings]);
  const dirty = JSON.stringify(v) !== JSON.stringify(settings);
  const save = useMutation({
    mutationFn: async () => {
      const rows = unwrap(await supabase.from('school_settings').update({
        school_name_ar: v.school_name_ar.trim(), school_name_en: v.school_name_en.trim(), attendance_mode: v.attendance_mode,
        periods_per_day: v.periods_per_day, teacher_backdate_days: v.teacher_backdate_days, follow_up_due_soon_days: v.follow_up_due_soon_days, updated_by: profile?.id,
      }).eq('id', 1).select('id'));
      if (!rows.length) throw { code: '42501' };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.settings });
      toast.success('تم حفظ الإعدادات');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = () => (v.attendance_mode !== settings.attendance_mode ? setConfirmMode(true) : save.mutate());
  return (
    <Card>
      <CardHeader icon={<Settings2 />} title="إعدادات المدرسة" description={`آخر تحديث: ${new Date(settings.updated_at).toLocaleString('ar-KW', { timeZone: 'Asia/Kuwait' })}`} />
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="اسم المدرسة (عربي)" htmlFor="s-name-ar" required><Input value={v.school_name_ar} onChange={(e) => setV({ ...v, school_name_ar: e.target.value })} required /></Field>
          <Field label="اسم المدرسة (إنجليزي)" htmlFor="s-name-en" required><Input dir="ltr" className="text-start" value={v.school_name_en} onChange={(e) => setV({ ...v, school_name_en: e.target.value })} required /></Field>
          <Field label="نظام رصد الحضور" htmlFor="s-mode" hint="يحدد شكل جلسات الرصد الجديدة. الجلسات السابقة تبقى كما هي.">
            <Select value={v.attendance_mode} onChange={(e) => setV({ ...v, attendance_mode: e.target.value })}>
              <option value="daily">يومي — جلسة واحدة لكل فصل يوميًا</option>
              <option value="period">بالحصة — جلسة لكل حصة</option>
            </Select>
          </Field>
          <Field label="عدد الحصص اليومية" htmlFor="s-periods" hint="يُستخدم في نظام الرصد بالحصة.">
            <Input type="number" min={1} max={10} value={v.periods_per_day} onChange={(e) => setV({ ...v, periods_per_day: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
          <Field label="مهلة الرصد المتأخر للمعلم (أيام)" htmlFor="s-backdate" hint="عدد الأيام السابقة التي يمكن للمعلم رصدها. ٠ = اليوم فقط.">
            <Input type="number" min={0} max={14} value={v.teacher_backdate_days} onChange={(e) => setV({ ...v, teacher_backdate_days: Math.min(14, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
          <Field label="تنبيه اقتراب موعد المتابعة (أيام)" htmlFor="s-due" hint="يُشعَر المسؤول عند اقتراب تاريخ الاستحقاق بهذا العدد من الأيام.">
            <Input type="number" min={1} max={14} value={v.follow_up_due_soon_days} onChange={(e) => setV({ ...v, follow_up_due_soon_days: Math.min(14, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
          <div className="rounded-md bg-surface-sunken p-3 text-sm text-fg-muted md:col-span-2">
            المنطقة الزمنية: <span className="ltr font-semibold text-fg">Asia/Kuwait (UTC+3)</span> — ثابتة لجميع التواريخ والتقارير. أيام الدراسة: الأحد–الخميس.
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button variant="secondary" disabled={!dirty} onClick={() => setV(settings)}>تراجع</Button>
            <Button type="submit" disabled={!dirty} loading={save.isPending}>حفظ الإعدادات</Button>
          </div>
        </form>
      </CardContent>
      <ConfirmDialog
        open={confirmMode}
        onOpenChange={setConfirmMode}
        title="تغيير نظام رصد الحضور"
        description={`سيتحول الرصد الجديد إلى نظام «${v.attendance_mode === 'daily' ? 'يومي' : 'بالحصة'}». الجلسات المسجلة سابقًا تبقى محفوظة كما هي. يُفضّل التغيير في بداية فصل دراسي.`}
        confirmLabel="تأكيد التغيير"
        loading={save.isPending}
        onConfirm={() => save.mutate(undefined, { onSuccess: () => setConfirmMode(false) })}
      />
    </Card>
  );
}

const YEAR_STATUS: Record<string, string> = { planned: 'مخطط', active: 'جارٍ', closed: 'مغلق' };

function YearDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing?: AcademicYear }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ name: '', starts_on: '', ends_on: '', status: 'planned' });
  React.useEffect(() => {
    if (open) setV({ name: editing?.name ?? '', starts_on: editing?.starts_on ?? '', ends_on: editing?.ends_on ?? '', status: editing?.status ?? 'planned' });
  }, [open, editing]);
  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: v.name.trim(), starts_on: v.starts_on, ends_on: v.ends_on, status: v.status };
      unwrap(editing ? await supabase.from('academic_years').update(payload).eq('id', editing.id).select('id') : await supabase.from('academic_years').insert(payload).select('id'));
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: qk.years }); toast.success('تم حفظ العام الدراسي'); onOpenChange(false); },
    onError: (e) => {
      const msg = errorMessage(e);
      toast.error((e as { code?: string })?.code === '23P01' ? 'تتداخل تواريخ هذا العام مع عام دراسي آخر' : /مكررة/.test(msg) ? 'يوجد عام دراسي بنفس الاسم' : msg);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'تعديل العام الدراسي' : 'إضافة عام دراسي'} size="sm">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (v.ends_on <= v.starts_on) return toast.error('تاريخ النهاية يجب أن يلي تاريخ البداية'); save.mutate(); }}>
          <Field label="الاسم" htmlFor="y-name" required hint="مثال: 2027/2028"><Input dir="ltr" className="text-start" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required minLength={4} /></Field>
          <Field label="تاريخ البداية" htmlFor="y-start" required><Input type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value })} required /></Field>
          <Field label="تاريخ النهاية" htmlFor="y-end" required><Input type="date" value={v.ends_on} onChange={(e) => setV({ ...v, ends_on: e.target.value })} required /></Field>
          <Field label="الحالة" htmlFor="y-status"><Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>{Object.entries(YEAR_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button><Button type="submit" loading={save.isPending}>حفظ</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AcademicYears() {
  const qc = useQueryClient();
  const years = useAcademicYears();
  const [dialog, setDialog] = React.useState<{ open: boolean; editing?: AcademicYear }>({ open: false });
  const [makeCurrent, setMakeCurrent] = React.useState<AcademicYear | null>(null);
  const setCurrent = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('academic_years').update({ is_current: true, status: 'active' }).eq('id', id).select('id')),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('تم تعيين العام الحالي'); setMakeCurrent(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader icon={<CalendarRange />} title="الأعوام الدراسية" description="لا تتداخل الأعوام، ويوجد عام حالي واحد فقط." actions={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> إضافة عام</Button>} />
      {years.isPending ? <LoadingState rows={3} /> : years.isError ? <ErrorState error={years.error} onRetry={() => years.refetch()} /> : years.data.length === 0 ? <EmptyState title="لا توجد أعوام دراسية" /> : (
        <Table caption="الأعوام الدراسية">
          <THead><Tr><Th>العام</Th><Th>البداية</Th><Th>النهاية</Th><Th>الحالة</Th><Th><span className="sr-only">إجراءات</span></Th></Tr></THead>
          <TBody>
            {years.data.map((y) => (
              <Tr key={y.id}>
                <Td className="font-semibold"><span className="ltr tabular">{y.name}</span>{y.is_current && <Badge tone="brand" className="ms-2"><Star aria-hidden /> الحالي</Badge>}</Td>
                <Td>{formatDate(y.starts_on)}</Td><Td>{formatDate(y.ends_on)}</Td>
                <Td><Badge tone={y.status === 'active' ? 'success' : 'neutral'}>{YEAR_STATUS[y.status]}</Badge></Td>
                <Td className="whitespace-nowrap text-end">
                  {!y.is_current && y.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setMakeCurrent(y)}>تعيين كعام حالي</Button>}
                  <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${y.name}`} onClick={() => setDialog({ open: true, editing: y })}><Pencil /></Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <YearDialog open={dialog.open} editing={dialog.editing} onOpenChange={(o) => setDialog({ open: o })} />
      <ConfirmDialog open={Boolean(makeCurrent)} onOpenChange={(o) => !o && setMakeCurrent(null)} title={`تعيين ${makeCurrent?.name ?? ''} عامًا حاليًا`} description="ستعتمد الشاشات الافتراضية (الفصول، الرصد، التقارير) على هذا العام." confirmLabel="تعيين" loading={setCurrent.isPending} onConfirm={() => setCurrent.mutate(makeCurrent!.id)} />
    </Card>
  );
}

type Category = Tables<'behavior_categories'>;

function Categories() {
  const qc = useQueryClient();
  const categories = useBehaviorCategories(true);
  const [edit, setEdit] = React.useState<{ open: boolean; c?: Category }>({ open: false });
  const [v, setV] = React.useState({ name: '', description: '', default_severity: 'low', sort_order: 0 });
  React.useEffect(() => {
    if (edit.open) setV({ name: edit.c?.name ?? '', description: edit.c?.description ?? '', default_severity: edit.c?.default_severity ?? 'low', sort_order: edit.c?.sort_order ?? ((categories.data?.length ?? 0) + 1) * 10 });
  }, [edit, categories.data]);
  const save = useMutation({
    mutationFn: async (patch: Partial<Category> & { id?: string }) => {
      const { id, ...rest } = patch;
      unwrap(id ? await supabase.from('behavior_categories').update(rest).eq('id', id).select('id') : await supabase.from('behavior_categories').insert(rest as Category).select('id'));
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: qk.categories }); toast.success('تم الحفظ'); setEdit({ open: false }); },
    onError: (e) => toast.error(/مكررة/.test(errorMessage(e)) ? 'يوجد تصنيف بنفس الاسم' : errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader icon={<Flag />} title="تصنيفات السلوك" description="لا تُحذف التصنيفات المستخدمة؛ يمكن إيقافها لتختفي من البلاغات الجديدة." actions={<Button size="sm" onClick={() => setEdit({ open: true })}><Plus /> إضافة تصنيف</Button>} />
      {categories.isPending ? <LoadingState rows={4} /> : categories.isError ? <ErrorState error={categories.error} /> : (
        <Table caption="تصنيفات السلوك">
          <THead><Tr><Th>التصنيف</Th><Th>الخطورة الافتراضية</Th><Th>الترتيب</Th><Th>الحالة</Th><Th><span className="sr-only">إجراءات</span></Th></Tr></THead>
          <TBody>
            {categories.data.map((c) => (
              <Tr key={c.id}>
                <Td><p className="font-semibold">{c.name}</p>{c.description && <p className="text-xs text-fg-muted">{c.description}</p>}</Td>
                <Td>{SEVERITY_LABELS[c.default_severity as Severity]}</Td>
                <Td className="tabular">{formatNumber(c.sort_order)}</Td>
                <Td><Badge tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'مفعّل' : 'موقوف'}</Badge></Td>
                <Td className="whitespace-nowrap text-end">
                  <Button size="sm" variant="ghost" loading={save.isPending && save.variables?.id === c.id} onClick={() => save.mutate({ id: c.id, is_active: !c.is_active })}>{c.is_active ? 'إيقاف' : 'تفعيل'}</Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${c.name}`} onClick={() => setEdit({ open: true, c })}><Pencil /></Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <Dialog open={edit.open} onOpenChange={(o) => setEdit({ open: o })}>
        <DialogContent title={edit.c ? 'تعديل التصنيف' : 'إضافة تصنيف'} size="sm">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: edit.c?.id, name: v.name.trim(), description: v.description.trim() || null, default_severity: v.default_severity, sort_order: v.sort_order }); }}>
            <Field label="الاسم" htmlFor="c-name" required><Input value={v.name} minLength={2} maxLength={80} required onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="الوصف" htmlFor="c-desc"><Input value={v.description} maxLength={300} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
            <Field label="الخطورة الافتراضية" htmlFor="c-sev"><Select value={v.default_severity} onChange={(e) => setV({ ...v, default_severity: e.target.value })}>{Object.entries(SEVERITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="ترتيب العرض" htmlFor="c-order"><Input type="number" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Number(e.target.value) || 0 })} /></Field>
            <DialogFooter><Button variant="secondary" onClick={() => setEdit({ open: false })}>إلغاء</Button><Button type="submit" loading={save.isPending}>حفظ</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function SettingsPage() {
  const settings = useSchoolSettings();
  return (
    <>
      <PageHeader title="الإعدادات" description="إعدادات المدرسة والأعوام الدراسية وتصنيفات السلوك. كل تغيير يُسجَّل في سجل التدقيق." />
      <Tabs defaultValue="school" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="school"><Settings2 /> المدرسة</TabsTrigger>
          <TabsTrigger value="years"><CalendarRange /> الأعوام الدراسية</TabsTrigger>
          <TabsTrigger value="categories"><Flag /> تصنيفات السلوك</TabsTrigger>
        </TabsList>
        <TabsContent value="school">{settings.isPending ? <LoadingState /> : settings.isError ? <ErrorState error={settings.error} /> : <SchoolSettingsForm settings={settings.data} />}</TabsContent>
        <TabsContent value="years"><AcademicYears /></TabsContent>
        <TabsContent value="categories"><Categories /></TabsContent>
      </Tabs>
    </>
  );
}
