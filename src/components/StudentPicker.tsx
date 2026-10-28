import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { controlClass } from '@/components/ui/input';
import { Spinner } from '@/components/ui/states';

export type PickedStudent = { id: string; full_name: string; student_number: string; class_name: string | null };

/**
 * Accessible student search combobox (ARIA 1.2 pattern). Results come from
 * search_students(), so they are already limited by RLS to the user's scope.
 */
export function StudentPicker({ id, value, onChange, multiple = false, max = 20, invalid, describedBy }: {
  id: string;
  value: PickedStudent[];
  onChange: (v: PickedStudent[]) => void;
  multiple?: boolean;
  max?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const term = useDebouncedValue(text.trim(), 250);
  const listId = `${id}-list`;

  const results = useQuery({
    queryKey: ['student-picker', term],
    queryFn: async () =>
      unwrap(await supabase.rpc('search_students', { p_search: term, p_status: 'active', p_limit: 8, p_offset: 0 })),
    enabled: term.length >= 2,
  });
  const options = (results.data ?? []).filter((r) => !value.some((v) => v.id === r.id));

  const pick = (r: (typeof options)[number]) => {
    const s = { id: r.id, full_name: r.full_name, student_number: r.student_number, class_name: r.class_name };
    onChange(multiple ? [...value, s].slice(0, max) : [s]);
    setText('');
    setOpen(false);
  };

  const showInput = multiple ? value.length < max : value.length === 0;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="الطلاب المختارون">
          {value.map((s) => (
            <li key={s.id} className="flex items-center gap-1 rounded-full border border-line bg-surface-sunken py-0.5 pe-1 ps-3 text-[0.8125rem]">
              <span className="font-semibold">{s.full_name}</span>
              {s.class_name && <span className="text-fg-muted">· {s.class_name}</span>}
              <button type="button" className="rounded-full p-1 text-fg-muted hover:bg-surface-hover hover:text-danger" aria-label={`إزالة ${s.full_name}`} onClick={() => onChange(value.filter((v) => v.id !== s.id))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showInput && (
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input
            id={id}
            role="combobox"
            aria-expanded={open && term.length >= 2}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            className={cn(controlClass, 'h-10 ps-9')}
            placeholder="ابحث باسم الطالب أو رقمه (حرفان على الأقل)"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); pick(options[active]); }
              else if (e.key === 'Escape') setOpen(false);
            }}
          />
          {open && term.length >= 2 && (
            <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-line bg-surface-raised p-1 shadow-lg">
              {results.isPending ? (
                <li className="p-3"><Spinner /></li>
              ) : options.length === 0 ? (
                <li className="p-3 text-sm text-fg-muted">لا توجد نتائج ضمن نطاق صلاحياتك</li>
              ) : (
                options.map((r, i) => (
                  <li
                    key={r.id}
                    id={`${listId}-${r.id}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                    onMouseEnter={() => setActive(i)}
                    className={cn('flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-sm', i === active && 'bg-surface-hover')}
                  >
                    <span className="font-semibold">{r.full_name}</span>
                    <span className="flex gap-2 text-xs text-fg-muted">
                      {r.class_name && <span>{r.class_name}</span>}
                      <span className="ltr tabular">{r.student_number}</span>
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
