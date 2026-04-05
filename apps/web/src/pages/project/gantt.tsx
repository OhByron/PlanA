import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Select, cn } from '@projecta/ui';
import type { WorkItem, Epic } from '@projecta/types';
import { useWorkItems, useUpdateWorkItem } from '../../hooks/use-work-items';
import { useEpics, useUpdateEpic } from '../../hooks/use-epics';
import { useSprints } from '../../hooks/use-sprints';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useProjectDependencies } from '../../hooks/use-project-dependencies';
import { useAuth } from '../../auth/auth-context';
import { TypeIcon } from '../../components/type-icon';
import { StatusBadge } from '../../components/status-badge';

// --- Constants ---
const ROW_H = 34;
const HDR_H = 50;
const LEFT_W = 380;
const BAR_Y_PAD = 5;

type ZoomLevel = 'day' | 'week' | 'month';
const ZOOM_DAY_W: Record<ZoomLevel, number> = { day: 40, week: 28, month: 8 };

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isWeekend(d: Date): boolean {
  const dow = d.getDay(); return dow === 0 || dow === 6;
}
function fmt(d: Date): string { return d.toISOString().slice(0, 10); }

// --- Types ---
interface GanttRow {
  id: string;
  rawId: string; // without epic- prefix
  title: string;
  type: 'epic' | 'story' | 'bug' | 'task';
  status: string;
  priority: string;
  depth: number;
  startDay: number;
  durationDays: number;
  progress: number;
  targetDay: number | null;
  assigneeName: string | undefined;
  itemNumber: number | null | undefined;
  isEpic: boolean;
  hasChildren: boolean;
}

// --- Component ---
export function GanttPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { user } = useAuth();
  const { data: items = [] } = useWorkItems(projectId);
  const { data: epics = [] } = useEpics(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: deps = [] } = useProjectDependencies(projectId);
  const updateItem = useUpdateWorkItem(projectId);
  const updateEpic = useUpdateEpic(projectId);

  const currentMember = members.find((m) => m.userId === user?.id);
  const isPM = currentMember?.jobRole === 'pm' || currentMember?.jobRole === 'po';

  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [filter, setFilter] = useState<'all' | 'epics'>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const DAY_W = ZOOM_DAY_W[zoom];

  const memberNames = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  // Toggle collapse
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Build rows & timeline
  const { timelineStart, timelineDays, rows, today } = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let earliest = new Date(now);
    let latest = addDays(now, 90);

    // Scan all dates
    for (const epic of epics) {
      if (epic.startDate) { const d = new Date(epic.startDate); if (d < earliest) earliest = d; }
      if (epic.dueDate) { const d = new Date(epic.dueDate); if (d > latest) latest = d; }
    }
    for (const s of sprints) {
      if (s.startDate) { const d = new Date(s.startDate); if (d < earliest) earliest = d; }
      if (s.endDate) { const d = new Date(s.endDate); if (d > latest) latest = d; }
    }
    for (const i of items) {
      if (i.startDate) { const d = new Date(i.startDate); if (d < earliest) earliest = d; }
      if (i.dueDate) { const d = new Date(i.dueDate); if (d > latest) latest = d; }
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
      const hasChildren = filter === 'all' && epicItems.some((i) => !i.parentId);

      ganttRows.push({
        id: `epic-${epic.id}`, rawId: epic.id, title: epic.title, type: 'epic',
        status: epic.status, priority: epic.priority, depth: 0,
        startDay: daysBetween(earliest, epicStart),
        durationDays: Math.max(1, daysBetween(epicStart, epicEnd)),
        progress, assigneeName: undefined,
        itemNumber: (epic as any).itemNumber,
        targetDay: epic.targetDate ? daysBetween(earliest, new Date(epic.targetDate)) : null,
        isEpic: true, hasChildren,
      });

      if (filter === 'all' && !collapsed.has(`epic-${epic.id}`)) {
        const topItems = items.filter((i) => i.epicId === epic.id && !i.parentId).sort((a, b) => a.orderIndex - b.orderIndex);

        function resolveDates(item: WorkItem): { start: Date; end: Date } {
          const children = items.filter((i) => i.parentId === item.id);
          let cStart: Date | null = null, cEnd: Date | null = null;
          for (const child of children) {
            const cd = resolveDates(child);
            if (!cStart || cd.start < cStart) cStart = cd.start;
            if (!cEnd || cd.end > cEnd) cEnd = cd.end;
          }
          return {
            start: item.startDate ? new Date(item.startDate) : cStart ?? epicStart,
            end: item.dueDate ? new Date(item.dueDate) : cEnd ?? addDays(item.startDate ? new Date(item.startDate) : epicStart, item.storyPoints ? Math.max(1, item.storyPoints * 2) : 5),
          };
        }

        function addRow(item: WorkItem, depth: number) {
          const { start, end } = resolveDates(item);
          const children = items.filter((i) => i.parentId === item.id);
          const doneKids = children.filter((c) => c.status === 'done' || c.status === 'cancelled').length;
          const itemProgress = item.status === 'done' || item.status === 'cancelled' ? 100
            : children.length > 0 ? Math.round((doneKids / children.length) * 100)
            : item.status === 'in_review' ? 80 : item.status === 'in_progress' ? 40 : item.status === 'ready' ? 10 : 0;
          const hasKids = children.length > 0;

          ganttRows.push({
            id: item.id, rawId: item.id, title: item.title, type: item.type,
            status: item.status, priority: item.priority, depth,
            startDay: daysBetween(earliest, start),
            durationDays: Math.max(1, daysBetween(start, end)),
            progress: itemProgress, assigneeName: item.assigneeId ? memberNames.get(item.assigneeId) : undefined,
            itemNumber: (item as any).itemNumber,
            targetDay: item.targetDate ? daysBetween(earliest, new Date(item.targetDate)) : null,
            isEpic: false, hasChildren: hasKids,
          });

          if (hasKids && !collapsed.has(item.id)) {
            for (const child of children.sort((a, b) => a.orderIndex - b.orderIndex)) addRow(child, depth + 1);
          }
        }
        for (const item of topItems) addRow(item, 1);
      }
    }

    return { timelineStart: earliest, timelineDays: daysBetween(earliest, latest), rows: ganttRows, today: daysBetween(earliest, now) };
  }, [epics, items, sprints, filter, memberNames, collapsed]);

  // --- Drag state for interactive bars ---
  const dragRef = useRef<{ rowId: string; mode: 'move' | 'resize-end'; startX: number; origStartDay: number; origDuration: number } | null>(null);
  const dragDeltaRef = useRef<{ deltaStart: number; deltaDuration: number }>({ deltaStart: 0, deltaDuration: 0 });
  const [dragDelta, setDragDelta] = useState<{ rowId: string; deltaStart: number; deltaDuration: number } | null>(null);

  const onBarMouseDown = useCallback((e: React.MouseEvent, row: GanttRow, mode: 'move' | 'resize-end') => {
    e.preventDefault();
    dragRef.current = { rowId: row.id, mode, startX: e.clientX, origStartDay: row.startDay, origDuration: row.durationDays };
    dragDeltaRef.current = { deltaStart: 0, deltaDuration: 0 };
    setDragDelta({ rowId: row.id, deltaStart: 0, deltaDuration: 0 });

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = Math.round((ev.clientX - dragRef.current.startX) / DAY_W);
      if (dragRef.current.mode === 'move') {
        dragDeltaRef.current = { deltaStart: dx, deltaDuration: 0 };
        setDragDelta({ rowId: dragRef.current.rowId, deltaStart: dx, deltaDuration: 0 });
      } else {
        const dd = Math.max(-dragRef.current.origDuration + 1, dx);
        dragDeltaRef.current = { deltaStart: 0, deltaDuration: dd };
        setDragDelta({ rowId: dragRef.current.rowId, deltaStart: 0, deltaDuration: dd });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (!dragRef.current) return;
      const d = dragRef.current;
      const ds = dragDeltaRef.current.deltaStart;
      const dd = dragDeltaRef.current.deltaDuration;
      dragRef.current = null;
      setDragDelta(null);

      if (ds === 0 && dd === 0) return;

      const newStart = addDays(timelineStart, d.origStartDay + ds);
      const newEnd = addDays(timelineStart, d.origStartDay + d.origDuration + ds + dd);

      if (d.rowId.startsWith('epic-')) {
        const epicId = d.rowId.replace('epic-', '');
        updateEpic.mutate({ epicId, data: { start_date: fmt(newStart), due_date: fmt(newEnd) } });
      } else {
        updateItem.mutate({ workItemId: d.rowId, data: { startDate: fmt(newStart), dueDate: fmt(newEnd) } });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [DAY_W, timelineStart, updateItem, updateEpic]);

  // --- Critical path ---
  const criticalPathIds = useMemo(() => {
    // Find the longest chain of depends_on edges (by total duration)
    const depEdges = deps.filter((d) => d.type === 'depends_on');
    const rowMap = new Map(rows.map((r) => [r.id, r]));

    // Build adjacency: target → [sources]
    const adj = new Map<string, string[]>();
    for (const d of depEdges) {
      const list = adj.get(d.targetId) ?? [];
      list.push(d.sourceId);
      adj.set(d.targetId, list);
    }

    // Find the path with the latest end day
    let longestPath: string[] = [];
    let longestEnd = 0;

    function walk(id: string, path: string[], visited: Set<string>) {
      const row = rowMap.get(id);
      if (!row) return;
      const end = row.startDay + row.durationDays;
      if (end > longestEnd) { longestEnd = end; longestPath = [...path, id]; }
      for (const next of adj.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          walk(next, [...path, id], visited);
          visited.delete(next);
        }
      }
    }

    // Start from items with no incoming deps
    const hasIncoming = new Set(depEdges.map((d) => d.sourceId));
    const roots = rows.filter((r) => !hasIncoming.has(r.id) && !r.isEpic);
    for (const root of roots) {
      walk(root.id, [], new Set([root.id]));
    }

    return new Set(longestPath);
  }, [deps, rows]);

  // --- Sprint bands ---
  const sprintBands = useMemo(() =>
    sprints.filter((s) => s.startDate && s.endDate && s.status !== 'cancelled').map((s) => ({
      name: s.name,
      startDay: daysBetween(timelineStart, new Date(s.startDate!)),
      durationDays: daysBetween(new Date(s.startDate!), new Date(s.endDate!)),
    })), [sprints, timelineStart]);

  // --- Capacity panel data ---
  const capacityData = useMemo(() => {
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const sprintList = sprints.filter((s) => s.startDate && s.endDate).sort((a, b) =>
      new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());

    // For each member, count points per sprint
    const data: Array<{
      name: string; role: string; capacity: number;
      sprintPoints: Array<{ sprintName: string; points: number }>;
      totalPoints: number;
    }> = [];

    const devMembers = members.filter((m) => m.capacity != null || ['dev', 'qe', 'ux', 'ba', 'bsa', 'pm', 'po'].includes(m.jobRole));
    for (const member of devMembers) {
      const memberItems = items.filter((i) => i.assigneeId === member.id);
      const sprintPoints = sprintList.map((sprint) => {
        // Items in this sprint assigned to this member
        const pts = memberItems
          .filter((i) => i.startDate && new Date(i.startDate) >= new Date(sprint.startDate!) && new Date(i.startDate) <= new Date(sprint.endDate!))
          .reduce((s, i) => s + (i.storyPoints ?? 0), 0);
        return { sprintName: sprint.name, points: pts };
      });
      data.push({
        name: member.name, role: member.jobRole.toUpperCase(),
        capacity: member.capacity ?? 0,
        sprintPoints,
        totalPoints: memberItems.reduce((s, i) => s + (i.storyPoints ?? 0), 0),
      });
    }
    return { members: data, sprints: sprintList.map((s) => s.name) };
  }, [members, items, sprints]);

  // --- Month headers ---
  const monthHeaders = useMemo(() => {
    const h: Array<{ label: string; startDay: number; widthDays: number }> = [];
    let d = new Date(timelineStart);
    while (daysBetween(timelineStart, d) < timelineDays) {
      const month = d.getMonth(); const year = d.getFullYear();
      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const startDay = daysBetween(timelineStart, d);
      const next = new Date(year, month + 1, 1);
      h.push({ label, startDay, widthDays: Math.min(daysBetween(timelineStart, next), timelineDays) - startDay });
      d = next;
    }
    return h;
  }, [timelineStart, timelineDays]);

  // --- Weekend columns ---
  const weekendCols = useMemo(() => {
    const cols: number[] = [];
    for (let i = 0; i < timelineDays; i++) { if (isWeekend(addDays(timelineStart, i))) cols.push(i); }
    return cols;
  }, [timelineStart, timelineDays]);

  if (!isPM) {
    return <div className="flex h-full items-center justify-center"><p className="text-sm text-gray-400">{t('gantt.pmOnly')}</p></div>;
  }

  const tlW = timelineDays * DAY_W;
  const totalH = HDR_H + rows.length * ROW_H;
  const BAR_BG: Record<string, string> = { epic: '#818cf8', story: '#6366f1', bug: '#f87171', task: '#38bdf8' };
  const DONE_BG = '#34d399';

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-700">{t('gantt.title')}</h2>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="w-32">
          <option value="all">{t('gantt.allItems')}</option>
          <option value="epics">{t('gantt.epicsOnly')}</option>
        </Select>
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {(['day', 'week', 'month'] as ZoomLevel[]).map((z) => (
            <button key={z} onClick={() => setZoom(z)}
              className={cn('rounded-md px-2 py-1 text-xs font-medium transition-colors',
                zoom === z ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {t(`gantt.zoom_${z}`)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-indigo-400" /> Epic</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-brand-500" /> Story</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-sky-400" /> Task</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-red-400" /> Bug</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-emerald-400" /> Done</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1 w-4 border-b-2 border-orange-500" /> Critical</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45 bg-red-500" /> Target</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="shrink-0 border-r border-gray-200 bg-white flex flex-col" style={{ width: LEFT_W }}>
          <div className="flex items-center border-b border-gray-200 bg-gray-50/80 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider" style={{ height: HDR_H }}>
            <span style={{ width: 20 }} />
            <span className="flex-1 ml-1">{t('gantt.item')}</span>
            <span className="w-14 text-center">{t('gantt.status')}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.id}
                className={cn('flex items-center border-b border-gray-50 px-3 transition-colors cursor-pointer',
                  row.isEpic ? 'bg-indigo-50/30' : 'bg-white',
                  hoveredRow === row.id && 'bg-brand-50/40',
                  criticalPathIds.has(row.id) && 'border-l-2 border-l-orange-400')}
                style={{ height: ROW_H, paddingLeft: `${8 + row.depth * 18}px` }}
                onMouseEnter={() => setHoveredRow(row.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {/* Collapse toggle */}
                {row.hasChildren ? (
                  <button onClick={() => toggleCollapse(row.id)} className="mr-1 text-gray-400 hover:text-gray-600 w-4 text-center">
                    {collapsed.has(row.id) ? '▸' : '▾'}
                  </button>
                ) : <span className="w-4 mr-1" />}

                {row.isEpic ? (
                  <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold text-indigo-600 uppercase">E</span>
                ) : <TypeIcon type={row.type as 'story' | 'bug' | 'task'} />}
                <Link
                  to={row.isEpic ? '/p/$projectId/epics/$epicId' : '/p/$projectId/items/$workItemId'}
                  params={row.isEpic ? { projectId, epicId: row.rawId } : { projectId, workItemId: row.rawId }}
                  className="ml-1.5 flex-1 truncate text-xs text-gray-800 hover:text-brand-700"
                >
                  {row.itemNumber != null && <span className="text-gray-300 mr-1 font-mono text-[10px]">#{row.itemNumber}</span>}
                  <span className={cn(row.isEpic && 'font-semibold')}>{row.title}</span>
                </Link>
                {row.assigneeName && <span className="mx-1 shrink-0 text-[10px] text-gray-400 truncate max-w-[50px]">{row.assigneeName}</span>}
                <span className="w-14 shrink-0 text-center"><StatusBadge status={row.status as any} /></span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: timeline */}
        <div className="flex-1 overflow-auto bg-white">
          <div className="relative" style={{ width: tlW, minHeight: totalH }}>
            {/* Month headers */}
            <div className="sticky top-0 z-20 flex" style={{ height: HDR_H / 2 }}>
              {monthHeaders.map((m, i) => (
                <div key={i} className="absolute border-r border-gray-200 bg-gray-50 px-3 text-[11px] font-semibold text-gray-700 flex items-center"
                  style={{ left: m.startDay * DAY_W, width: m.widthDays * DAY_W, height: HDR_H / 2 }}>{m.label}</div>
              ))}
            </div>

            {/* Week ticks */}
            <div className="sticky z-20 flex border-b border-gray-200 bg-gray-50/90" style={{ top: HDR_H / 2, height: HDR_H / 2 }}>
              {(() => {
                const ticks: React.ReactNode[] = [];
                let d = new Date(timelineStart);
                const dow = d.getDay();
                if (dow !== 1) d = addDays(d, dow === 0 ? 1 : 8 - dow);
                while (daysBetween(timelineStart, d) < timelineDays) {
                  const day = daysBetween(timelineStart, d);
                  ticks.push(<div key={day} className="absolute text-[9px] text-gray-400 flex items-end pb-0.5 px-0.5"
                    style={{ left: day * DAY_W, height: HDR_H / 2 }}>{d.getDate()} {d.toLocaleDateString(undefined, { month: 'short' })}</div>);
                  d = addDays(d, 7);
                }
                return ticks;
              })()}
            </div>

            {/* Weekend shading */}
            {weekendCols.map((col) => (
              <div key={col} className="absolute bg-gray-50/60" style={{ left: col * DAY_W, width: DAY_W, top: HDR_H, height: rows.length * ROW_H }} />
            ))}

            {/* Row gridlines */}
            {rows.map((_, i) => (
              <div key={i} className="absolute border-b border-gray-100" style={{ top: HDR_H + i * ROW_H, width: tlW, height: ROW_H }} />
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
                <div className="absolute z-30 rounded-b bg-red-400 px-1 text-[8px] font-bold text-white" style={{ left: today * DAY_W - 12, top: 0 }}>Today</div>
              </>
            )}

            {/* Dependency arrows */}
            <svg className="absolute top-0 left-0 pointer-events-none z-10" width={tlW} height={totalH}>
              <defs>
                <marker id="ga" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1 L 7 4 L 0 7 z" fill="#6b7280" />
                </marker>
                <marker id="ga-crit" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1 L 7 4 L 0 7 z" fill="#f97316" />
                </marker>
              </defs>
              {deps.filter((d) => d.type === 'depends_on').map((dep) => {
                const tgtIdx = rows.findIndex((r) => r.id === dep.targetId);
                const srcIdx = rows.findIndex((r) => r.id === dep.sourceId);
                if (tgtIdx === -1 || srcIdx === -1) return null;
                const tgt = rows[tgtIdx]!; const src = rows[srcIdx]!;
                const x1 = (tgt.startDay + tgt.durationDays) * DAY_W;
                const y1 = HDR_H + tgtIdx * ROW_H + ROW_H / 2;
                const x2 = src.startDay * DAY_W;
                const y2 = HDR_H + srcIdx * ROW_H + ROW_H / 2;
                const midX = Math.max(x1 + 14, (x1 + x2) / 2);
                const isCrit = criticalPathIds.has(dep.targetId) && criticalPathIds.has(dep.sourceId);
                return (
                  <path key={dep.id} d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    fill="none" stroke={isCrit ? '#f97316' : dep.strength === 'hard' ? '#6b7280' : '#d97706'}
                    strokeWidth={isCrit ? 2 : 1.5} strokeDasharray={dep.strength === 'soft' ? '5 3' : undefined}
                    markerEnd={isCrit ? 'url(#ga-crit)' : 'url(#ga)'} opacity={0.7} />
                );
              })}
            </svg>

            {/* Bars */}
            {rows.map((row, i) => {
              const isDone = row.status === 'done' || row.status === 'cancelled';
              const isCritical = criticalPathIds.has(row.id);
              const bg = isDone ? DONE_BG : BAR_BG[row.type] ?? '#9ca3af';
              const barH = row.isEpic ? ROW_H - BAR_Y_PAD * 2 - 2 : ROW_H - BAR_Y_PAD * 2 - 6;
              const barTop = HDR_H + i * ROW_H + (ROW_H - barH) / 2;

              // Apply drag delta
              let sDay = row.startDay;
              let dur = row.durationDays;
              if (dragDelta && dragDelta.rowId === row.id) {
                sDay += dragDelta.deltaStart;
                dur += dragDelta.deltaDuration;
              }
              const barW = dur * DAY_W;

              return (
                <React.Fragment key={row.id}>
                  {/* Bar */}
                  <div
                    className={cn('absolute rounded-sm overflow-hidden select-none',
                      hoveredRow === row.id && 'ring-1 ring-gray-400',
                      isCritical && !isDone && 'ring-1 ring-orange-400')}
                    style={{ top: barTop, left: sDay * DAY_W, width: Math.max(barW, DAY_W), height: barH, cursor: 'grab' }}
                    onMouseEnter={() => setHoveredRow(row.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onMouseDown={(e) => onBarMouseDown(e, row, 'move')}
                  >
                    <div className="absolute inset-0 rounded-sm" style={{ backgroundColor: bg, opacity: row.isEpic ? 0.35 : 0.25 }} />
                    <div className="absolute left-0 top-0 bottom-0 rounded-sm" style={{ width: `${row.progress}%`, backgroundColor: bg, opacity: row.isEpic ? 0.7 : 0.85 }} />
                    {barW > 60 && <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-gray-700 truncate z-10">{row.title}</span>}
                    {barW > 40 && row.progress > 0 && row.progress < 100 && (
                      <span className="absolute right-1 top-0 bottom-0 flex items-center text-[9px] font-bold text-gray-500 z-10">{row.progress}%</span>
                    )}
                    {row.isEpic && (
                      <>
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2.5 h-2.5 rotate-45 rounded-sm" style={{ backgroundColor: bg }} />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-2.5 h-2.5 rotate-45 rounded-sm" style={{ backgroundColor: bg }} />
                      </>
                    )}
                    {/* Resize handle on right edge */}
                    <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10 z-20"
                      onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, row, 'resize-end'); }} />
                  </div>
                  {/* Target date diamond */}
                  {row.targetDay != null && (
                    <div className="absolute z-20 w-2.5 h-2.5 rotate-45 bg-red-500 border border-white"
                      style={{ left: row.targetDay * DAY_W - 5, top: barTop + barH / 2 - 5 }}
                      title={`Target: ${addDays(timelineStart, row.targetDay).toLocaleDateString()}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Capacity panel */}
      {capacityData.members.length > 0 && (
        <div className="border-t border-gray-200 bg-white max-h-48 overflow-auto">
          <div className="px-4 py-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('gantt.resourceAllocation')}</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1 font-medium w-32">{t('gantt.member')}</th>
                  <th className="py-1 font-medium w-12 text-center">{t('gantt.role')}</th>
                  <th className="py-1 font-medium w-16 text-center">{t('gantt.totalPts')}</th>
                  <th className="py-1 font-medium w-16 text-center">{t('gantt.capacity')}</th>
                  {capacityData.sprints.map((s) => (
                    <th key={s} className="py-1 font-medium text-center px-1">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capacityData.members.map((m) => (
                  <tr key={m.name} className="border-t border-gray-50">
                    <td className="py-1 text-gray-700 font-medium">{m.name}</td>
                    <td className="py-1 text-center text-gray-400">{m.role}</td>
                    <td className="py-1 text-center font-medium">{m.totalPoints}</td>
                    <td className="py-1 text-center text-gray-400">{m.capacity || '—'}</td>
                    {m.sprintPoints.map((sp) => {
                      const over = m.capacity > 0 && sp.points > m.capacity;
                      const at = m.capacity > 0 && sp.points > m.capacity * 0.8;
                      return (
                        <td key={sp.sprintName} className={cn('py-1 text-center font-medium',
                          over ? 'text-red-600 bg-red-50' : at ? 'text-amber-600 bg-amber-50' : sp.points > 0 ? 'text-gray-700' : 'text-gray-300')}>
                          {sp.points || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
