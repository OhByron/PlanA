import { useMemo, useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Select, cn } from '@projecta/ui';
import type { WorkItem } from '@projecta/types';
import { useWorkItems } from '../../hooks/use-work-items';
import { useSprints } from '../../hooks/use-sprints';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useAuth } from '../../auth/auth-context';
import { TypeIcon } from '../../components/type-icon';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { user } = useAuth();
  const { data: items = [] } = useWorkItems(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const { data: members = [] } = useProjectMembers(projectId);

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const currentMember = members.find((m) => m.userId === user?.id);
  const memberNames = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (assigneeFilter === 'mine') {
      return items.filter((i) => currentMember && i.assigneeId === currentMember.id);
    }
    if (assigneeFilter !== 'all') {
      return items.filter((i) => i.assigneeId === assigneeFilter);
    }
    return items;
  }, [items, assigneeFilter, currentMember]);

  // Build calendar grid
  const { weeks, monthLabel } = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    // Start on Monday
    const firstDay = start.getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - offset);

    const weeks: Date[][] = [];
    let current = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      // Stop if the whole week is in the next month
      if (week[0]!.getMonth() !== start.getMonth() && w > 0) break;
      weeks.push(week);
    }

    return { weeks, monthLabel: label };
  }, [currentMonth]);

  // Map items to calendar dates.
  // Items with start_date show on that date.
  // Items with due_date also show on that date.
  // Items with neither show on their creation date.
  const itemsByDate = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    const add = (key: string, item: WorkItem) => {
      const list = map.get(key) ?? [];
      if (!list.some((i) => i.id === item.id)) list.push(item);
      map.set(key, list);
    };
    for (const item of filteredItems) {
      if (item.startDate) {
        add(new Date(item.startDate).toISOString().slice(0, 10), item);
      }
      if (item.dueDate) {
        add(new Date(item.dueDate).toISOString().slice(0, 10), item);
      }
      if (!item.startDate && !item.dueDate) {
        add(new Date(item.createdAt).toISOString().slice(0, 10), item);
      }
    }
    return map;
  }, [filteredItems]);

  // Sprint date ranges for background bands
  const sprintDates = useMemo(() => {
    return sprints
      .filter((s) => s.startDate && s.endDate && s.status !== 'cancelled')
      .map((s) => ({
        name: s.name,
        start: new Date(s.startDate!),
        end: new Date(s.endDate!),
      }));
  }, [sprints]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const STATUS_COLORS: Record<string, string> = {
    backlog: 'bg-gray-100 text-gray-600',
    ready: 'bg-blue-50 text-blue-700',
    in_progress: 'bg-brand-50 text-brand-700',
    in_review: 'bg-amber-50 text-amber-700',
    done: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-gray-50 text-gray-400 line-through',
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}>
          ←
        </Button>
        <h2 className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">{monthLabel}</h2>
        <Button size="sm" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          →
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>
          {t('calendar.today')}
        </Button>

        <div className="flex-1" />

        <Select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="w-40"
          aria-label="Filter by assignee"
        >
          <option value="all">{t('calendar.everyone')}</option>
          <option value="mine">{t('calendar.myWork')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
              {t(`calendar.${d.toLowerCase()}`)}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {weeks.map((week) =>
            week.map((day) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isToday = isSameDay(day, now);
              const dateKey = day.toISOString().slice(0, 10);
              const dayItems = itemsByDate.get(dateKey) ?? [];
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              // Check if day is in a sprint
              const inSprint = sprintDates.find(
                (s) => day >= s.start && day <= s.end,
              );

              return (
                <div
                  key={dateKey}
                  className={cn(
                    'min-h-[100px] p-1',
                    isCurrentMonth ? 'bg-white' : 'bg-gray-50',
                    isWeekend && 'bg-gray-50/80',
                    inSprint && isCurrentMonth && 'bg-sky-50/40',
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        'text-xs',
                        isToday && 'rounded-full bg-brand-600 text-white px-1.5 py-0.5 font-bold',
                        !isToday && isCurrentMonth && 'text-gray-700',
                        !isToday && !isCurrentMonth && 'text-gray-300',
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {inSprint && (
                      <span className="text-[8px] text-sky-500 truncate max-w-[60px]">{inSprint.name}</span>
                    )}
                  </div>

                  {/* Item chips */}
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((item) => (
                      <Link
                        key={item.id}
                        to="/p/$projectId/items/$workItemId"
                        params={{ projectId, workItemId: item.id }}
                        className={cn(
                          'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] truncate hover:opacity-80',
                          STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600',
                        )}
                        title={item.title}
                      >
                        <TypeIcon type={item.type} />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-[9px] text-gray-400 px-1">
                        +{dayItems.length - 3} {t('calendar.more')}
                      </span>
                    )}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
