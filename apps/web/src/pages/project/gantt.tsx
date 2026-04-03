import { useMemo, useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Select, cn } from '@projecta/ui';
import type { WorkItem, Epic } from '@projecta/types';
import { useWorkItems } from '../../hooks/use-work-items';
import { useEpics } from '../../hooks/use-epics';
import { useSprints } from '../../hooks/use-sprints';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useProjectDependencies } from '../../hooks/use-project-dependencies';
import { useAuth } from '../../auth/auth-context';
import { TypeIcon } from '../../components/type-icon';
import { StatusBadge } from '../../components/status-badge';
import { PriorityIndicator } from '../../components/priority-indicator';

const DAY_W = 32;
const ROW_H = 36;
const HDR_H = 52;
const LEFT_W = 400;
const BAR_Y_PAD = 5;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

interface GanttRow {
  id: string;
  title: string;
  type: 'epic' | 'story' | 'bug' | 'task';
  status: string;
  priority: string;
  depth: number;
  startDay: number;
  durationDays: number;
  progress: number; // 0-100
  assigneeName: string | undefined;
  itemNumber: number | null | undefined;
}

export function GanttPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { user } = useAuth();
  const { data: items = [] } = useWorkItems(projectId);
  const { data: epics = [] } = useEpics(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: deps = [] } = useProjectDependencies(projectId);

  const currentMember = members.find((m) => m.userId === user?.id);
  const isPM = currentMember?.jobRole === 'pm' || currentMember?.jobRole === 'po';
  const [filter, setFilter] = useState<'all' | 'epics'>('all');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const memberNames = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );

  // Build rows and timeline
  const { timelineStart, timelineDays, rows, today } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let earliest = new Date(now);
    let latest = addDays(now, 90);

    for (const epic of epics) {
      if (epic.startDate) { const d = new Date(epic.startDate); if (d < earliest) earliest = d; }
      if (epic.dueDate) { const d = new Date(epic.dueDate); if (d > latest) latest = d; }
    }
    for (const sprint of sprints) {
      if (sprint.startDate) { const d = new Date(sprint.startDate); if (d < earliest) earliest = d; }
      if (sprint.endDate) { const d = new Date(sprint.endDate); if (d > latest) latest = d; }
    }
    for (const item of items) {
      if (item.startDate) { const d = new Date(item.startDate); if (d < earliest) earliest = d; }
      if (item.dueDate) { const d = new Date(item.dueDate); if (d > latest) latest = d; }
    }

    earliest = addDays(earliest, -7);
    latest = addDays(latest, 14);

    const ganttRows: GanttRow[] = [];

    for (const epic of epics) {
      const epicStart = epic.startDate ? new Date(epic.startDate) : now;
      const epicEnd = epic.dueDate ? new Date(epic.dueDate) : addDays(epicStart, 42);
      const epicItems = items.filter((i) => i.epicId === epic.id);
      const doneCount = epicItems.filter((i) => i.status === 'done' || i.status === 'cancelled').length;
      const progress = epicItems.length > 0 ? Math.round((doneCount / epicItems.length) * 100) : 0;

      ganttRows.push({
        id: `epic-${epic.id}`,
        title: epic.title,
        type: 'epic',
        status: epic.status,
        priority: epic.priority,
        depth: 0,
        startDay: daysBetween(earliest, epicStart),
        durationDays: Math.max(1, daysBetween(epicStart, epicEnd)),
        progress,
        assigneeName: undefined,
        itemNumber: (epic as any).itemNumber,
      });

      if (filter === 'all') {
        const topItems = items
          .filter((i) => i.epicId === epic.id && !i.parentId)
          .sort((a, b) => a.orderIndex - b.orderIndex);

        function resolveDates(item: WorkItem): { start: Date; end: Date } {
          const children = items.filter((i) => i.parentId === item.id);
          let cStart: Date | null = null;
          let cEnd: Date | null = null;
          for (const child of children) {
            const cd = resolveDates(child);
            if (!cStart || cd.start < cStart) cStart = cd.start;
            if (!cEnd || cd.end > cEnd) cEnd = cd.end;
          }
          const start = item.startDate ? new Date(item.startDate) : cStart ?? epicStart;
          const end = item.dueDate ? new Date(item.dueDate)
            : cEnd ?? addDays(start, item.storyPoints ? Math.max(1, item.storyPoints * 2) : 5);
          return { start, end };
        }

        function addRow(item: WorkItem, depth: number) {
          const { start, end } = resolveDates(item);
          const children = items.filter((i) => i.parentId === item.id);
          const doneKids = children.filter((c) => c.status === 'done' || c.status === 'cancelled').length;
          const itemProgress = item.status === 'done' || item.status === 'cancelled' ? 100
            : children.length > 0 ? Math.round((doneKids / children.length) * 100)
            : item.status === 'in_review' ? 80
            : item.status === 'in_progress' ? 40
            : item.status === 'ready' ? 10 : 0;

          ganttRows.push({
            id: item.id,
            title: item.title,
            type: item.type,
            status: item.status,
            priority: item.priority,
            depth,
            startDay: daysBetween(earliest, start),
            durationDays: Math.max(1, daysBetween(start, end)),
            progress: itemProgress,
            assigneeName: item.assigneeId ? memberNames.get(item.assigneeId) : undefined,
            itemNumber: (item as any).itemNumber,
          });

          for (const child of children.sort((a, b) => a.orderIndex - b.orderIndex)) {
            addRow(child, depth + 1);
          }
        }

        for (const item of topItems) addRow(item, 1);
      }
    }

    return { timelineStart: earliest, timelineDays: daysBetween(earliest, latest), rows: ganttRows, today: daysBetween(earliest, now) };
  }, [epics, items, sprints, filter, memberNames]);

  // Headers
  const monthHeaders = useMemo(() => {
    const h: Array<{ label: string; startDay: number; widthDays: number }> = [];
    let d = new Date(timelineStart);
    while (daysBetween(timelineStart, d) < timelineDays) {
      const month = d.getMonth();
      const year = d.getFullYear();
      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const startDay = daysBetween(timelineStart, d);
      const next = new Date(year, month + 1, 1);
      h.push({ label, startDay, widthDays: Math.min(daysBetween(timelineStart, next), timelineDays) - startDay });
      d = next;
    }
    return h;
  }, [timelineStart, timelineDays]);

  // Weekend columns
  const weekendCols = useMemo(() => {
    const cols: number[] = [];
    for (let i = 0; i < timelineDays; i++) {
      if (isWeekend(addDays(timelineStart, i))) cols.push(i);
    }
    return cols;
  }, [timelineStart, timelineDays]);

  // Sprint bands
  const sprintBands = useMemo(() => {
    return sprints
      .filter((s) => s.startDate && s.endDate && s.status !== 'cancelled')
      .map((s) => ({
        name: s.name,
        startDay: daysBetween(timelineStart, new Date(s.startDate!)),
        durationDays: daysBetween(new Date(s.startDate!), new Date(s.endDate!)),
      }));
  }, [sprints, timelineStart]);

  if (!isPM) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">{t('gantt.pmOnly')}</p>
      </div>
    );
  }

  const tlW = timelineDays * DAY_W;
  const totalH = HDR_H + rows.length * ROW_H;

  const BAR_BG: Record<string, string> = {
    epic: '#818cf8',    // indigo-400
    story: '#6366f1',   // brand
    bug: '#f87171',     // red-400
    task: '#38bdf8',    // sky-400
  };
  const DONE_BG = '#34d399'; // emerald-400

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-700">{t('gantt.title')}</h2>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'epics')} className="w-36">
          <option value="all">{t('gantt.allItems')}</option>
          <option value="epics">{t('gantt.epicsOnly')}</option>
        </Select>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-indigo-400" /> Epic</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-brand-500" /> Story</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-sky-400" /> Task</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-red-400" /> Bug</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-emerald-400" /> Done</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="shrink-0 border-r border-gray-200 bg-white flex flex-col" style={{ width: LEFT_W }}>
          {/* Column headers */}
          <div className="flex items-center border-b border-gray-200 bg-gray-50/80 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider" style={{ height: HDR_H }}>
            <span style={{ width: 24 }} />
            <span className="flex-1 ml-1">{t('gantt.item')}</span>
            <span className="w-14 text-center">{t('gantt.status')}</span>
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {rows.map((row) => (
              <Link
                key={row.id}
                to={row.id.startsWith('epic-')
                  ? '/p/$projectId/epics/$epicId'
                  : '/p/$projectId/items/$workItemId'}
                params={row.id.startsWith('epic-')
                  ? { projectId, epicId: row.id.replace('epic-', '') }
                  : { projectId, workItemId: row.id }}
                className={cn(
                  'flex items-center border-b border-gray-50 px-3 transition-colors',
                  row.type === 'epic' ? 'bg-indigo-50/30' : 'bg-white',
                  hoveredRow === row.id && 'bg-brand-50/40',
                )}
                style={{ height: ROW_H, paddingLeft: `${12 + row.depth * 20}px` }}
                onMouseEnter={() => setHoveredRow(row.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {row.type === 'epic' ? (
                  <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold text-indigo-600 uppercase">E</span>
                ) : (
                  <TypeIcon type={row.type} />
                )}
                <span className="ml-1.5 flex-1 truncate text-xs text-gray-800">
                  {row.itemNumber != null && (
                    <span className="text-gray-300 mr-1 font-mono text-[10px]">#{row.itemNumber}</span>
                  )}
                  <span className={cn(row.type === 'epic' && 'font-semibold')}>{row.title}</span>
                </span>
                {row.assigneeName && (
                  <span className="mx-1 shrink-0 text-[10px] text-gray-400 truncate max-w-[50px]">{row.assigneeName}</span>
                )}
                <span className="w-14 shrink-0 text-center">
                  <StatusBadge status={row.status as any} />
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Right panel: timeline */}
        <div className="flex-1 overflow-auto bg-white">
          <div className="relative" style={{ width: tlW, minHeight: totalH }}>

            {/* Month headers */}
            <div className="sticky top-0 z-20 flex" style={{ height: HDR_H / 2 }}>
              {monthHeaders.map((m, i) => (
                <div
                  key={i}
                  className="absolute border-r border-gray-200 bg-gray-50 px-3 text-[11px] font-semibold text-gray-700 flex items-center"
                  style={{ left: m.startDay * DAY_W, width: m.widthDays * DAY_W, height: HDR_H / 2 }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Week tick marks */}
            <div className="sticky z-20 flex border-b border-gray-200 bg-gray-50/90" style={{ top: HDR_H / 2, height: HDR_H / 2 }}>
              {(() => {
                const ticks: React.ReactNode[] = [];
                let d = new Date(timelineStart);
                const dow = d.getDay();
                if (dow !== 1) d = addDays(d, dow === 0 ? 1 : 8 - dow);
                while (daysBetween(timelineStart, d) < timelineDays) {
                  const day = daysBetween(timelineStart, d);
                  ticks.push(
                    <div
                      key={day}
                      className="absolute text-[9px] text-gray-400 flex items-end pb-0.5 px-0.5"
                      style={{ left: day * DAY_W, height: HDR_H / 2 }}
                    >
                      {d.getDate()} {d.toLocaleDateString(undefined, { month: 'short' })}
                    </div>,
                  );
                  d = addDays(d, 7);
                }
                return ticks;
              })()}
            </div>

            {/* Weekend shading */}
            {weekendCols.map((col) => (
              <div
                key={col}
                className="absolute bg-gray-50/60"
                style={{ left: col * DAY_W, width: DAY_W, top: HDR_H, height: rows.length * ROW_H }}
              />
            ))}

            {/* Row gridlines */}
            {rows.map((_, i) => (
              <div
                key={i}
                className="absolute border-b border-gray-100"
                style={{ top: HDR_H + i * ROW_H, width: tlW, height: ROW_H }}
              />
            ))}

            {/* Sprint bands */}
            {sprintBands.map((band, i) => (
              <div key={i} className="absolute" style={{ left: band.startDay * DAY_W, width: band.durationDays * DAY_W, top: HDR_H, height: rows.length * ROW_H }}>
                <div className="h-full w-full rounded bg-sky-100/30 border border-sky-200/30" />
                <div className="absolute -top-0 left-1 text-[8px] text-sky-400 font-medium">{band.name}</div>
              </div>
            ))}

            {/* Today line */}
            {today >= 0 && today < timelineDays && (
              <>
                <div className="absolute z-30 w-0.5 bg-red-400" style={{ left: today * DAY_W - 1, top: 0, height: totalH }} />
                <div className="absolute z-30 rounded-b bg-red-400 px-1 text-[8px] font-bold text-white" style={{ left: today * DAY_W - 12, top: 0 }}>
                  {t('calendar.today')}
                </div>
              </>
            )}

            {/* Dependency arrows */}
            <svg className="absolute top-0 left-0 pointer-events-none z-10" width={tlW} height={totalH}>
              <defs>
                <marker id="ga" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1 L 7 4 L 0 7 z" fill="#6b7280" />
                </marker>
                <marker id="ga-soft" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1 L 7 4 L 0 7 z" fill="#d97706" />
                </marker>
              </defs>
              {deps
                .filter((d) => d.type === 'depends_on')
                .map((dep) => {
                  const tgtIdx = rows.findIndex((r) => r.id === dep.targetId);
                  const srcIdx = rows.findIndex((r) => r.id === dep.sourceId);
                  if (tgtIdx === -1 || srcIdx === -1) return null;
                  const tgt = rows[tgtIdx]!;
                  const src = rows[srcIdx]!;

                  const x1 = (tgt.startDay + tgt.durationDays) * DAY_W;
                  const y1 = HDR_H + tgtIdx * ROW_H + ROW_H / 2;
                  const x2 = src.startDay * DAY_W;
                  const y2 = HDR_H + srcIdx * ROW_H + ROW_H / 2;

                  const midX = Math.max(x1 + 14, (x1 + x2) / 2);
                  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
                  const isHard = dep.strength === 'hard';

                  return (
                    <path
                      key={dep.id}
                      d={path}
                      fill="none"
                      stroke={isHard ? '#6b7280' : '#d97706'}
                      strokeWidth={1.5}
                      strokeDasharray={isHard ? undefined : '5 3'}
                      markerEnd={isHard ? 'url(#ga)' : 'url(#ga-soft)'}
                      opacity={0.7}
                    />
                  );
                })}
            </svg>

            {/* Bars */}
            {rows.map((row, i) => {
              const isDone = row.status === 'done' || row.status === 'cancelled';
              const barW = row.durationDays * DAY_W;
              const bg = isDone ? DONE_BG : BAR_BG[row.type] ?? '#9ca3af';
              const isEpic = row.type === 'epic';
              const barH = isEpic ? ROW_H - BAR_Y_PAD * 2 - 2 : ROW_H - BAR_Y_PAD * 2 - 6;
              const barTop = HDR_H + i * ROW_H + (ROW_H - barH) / 2;

              return (
                <div
                  key={row.id}
                  className={cn(
                    'absolute rounded-sm overflow-hidden transition-opacity',
                    hoveredRow === row.id && 'ring-1 ring-gray-400',
                  )}
                  style={{
                    top: barTop,
                    left: row.startDay * DAY_W,
                    width: barW,
                    height: barH,
                  }}
                  onMouseEnter={() => setHoveredRow(row.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Background */}
                  <div
                    className="absolute inset-0 rounded-sm"
                    style={{ backgroundColor: bg, opacity: isEpic ? 0.35 : 0.25 }}
                  />
                  {/* Progress fill */}
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-sm"
                    style={{
                      width: `${row.progress}%`,
                      backgroundColor: bg,
                      opacity: isEpic ? 0.7 : 0.85,
                    }}
                  />
                  {/* Label on bar (if wide enough) */}
                  {barW > 60 && (
                    <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-gray-700 truncate z-10">
                      {row.title}
                    </span>
                  )}
                  {/* Progress % on right */}
                  {barW > 40 && row.progress > 0 && row.progress < 100 && (
                    <span className="absolute right-1 top-0 bottom-0 flex items-center text-[9px] font-bold text-gray-500 z-10">
                      {row.progress}%
                    </span>
                  )}
                  {/* Epic diamond markers at start and end */}
                  {isEpic && (
                    <>
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2.5 h-2.5 rotate-45 rounded-sm" style={{ backgroundColor: bg }} />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-2.5 h-2.5 rotate-45 rounded-sm" style={{ backgroundColor: bg }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
