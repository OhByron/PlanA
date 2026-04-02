import { useMemo, useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { Badge, Select } from '@projecta/ui';
import type { WorkItem } from '@projecta/types';
import { useTranslation } from 'react-i18next';
import { useWorkItems } from '../../hooks/use-work-items';
import { useSprints, useSprintItems } from '../../hooks/use-sprints';
import { useEpics } from '../../hooks/use-epics';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useProjectBlockedStatus } from '../../hooks/use-project-dependencies';
import { useBurndown } from '../../hooks/use-burndown';
import { StatusBadge } from '../../components/status-badge';
import { TypeIcon } from '../../components/type-icon';
import { HelpOverlay } from '../../components/help-overlay';

export function ReportsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: items = [] } = useWorkItems(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const { data: epics = [] } = useEpics(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { blockedItems } = useProjectBlockedStatus(projectId, items);

  // Sprint selector — default to active sprint, allow selecting any
  const activeSprint = sprints.find((s) => s.status === 'active');
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  // Resolve the selected sprint (default to active if none selected)
  const displaySprint = selectedSprintId
    ? sprints.find((s) => s.id === selectedSprintId)
    : activeSprint;

  const { data: sprintItems = [] } = useSprintItems(displaySprint?.id ?? '');

  // Sort sprints for the dropdown: active first, then planned, then completed (newest first)
  const sortedSprints = useMemo(() => {
    const order: Record<string, number> = { active: 0, planned: 1, completed: 2, cancelled: 3 };
    return [...sprints].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
  }, [sprints]);

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <HelpOverlay id="reports-intro" title={t('reports.helpTitle')}>
        <p className="mb-2">
          {t('reports.helpBody1')}
        </p>
        <p>
          {t('reports.helpBody2')}
        </p>
      </HelpOverlay>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('reports.title')}</h2>
        {sprints.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{t('reports.sprint')}</span>
            <Select
              value={selectedSprintId ?? displaySprint?.id ?? ''}
              onChange={(e) => setSelectedSprintId(e.target.value || null)}
              className="w-56"
              aria-label="Sprint selector"
            >
              {sortedSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status}{s.velocity != null ? ` · ${s.velocity} pts` : ''})
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <VelocityChart sprints={sprints} allItems={items} />
      {displaySprint && (
        <SprintProgress sprint={displaySprint} items={sprintItems} allItems={items} />
      )}
      {displaySprint && (
        <BurndownChart projectId={projectId} sprintId={displaySprint.id} sprintName={displaySprint.name} />
      )}
      <EpicProgress epics={epics} items={items} projectId={projectId} />
      {displaySprint && (
        <TeamWorkload items={sprintItems} allItems={items} members={members} />
      )}
      <BlockedReport items={items} blockedItems={blockedItems} projectId={projectId} />
    </div>
  );
}

// --- Velocity Chart ---
function VelocityChart({
  sprints,
  allItems,
}: {
  sprints: import('@projecta/types').Sprint[];
  allItems: WorkItem[];
}) {
  const { t } = useTranslation();
  const completedSprints = sprints
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));

  // For each completed sprint, we'd ideally have stored velocity.
  // For now, calculate from current data — items that were in the sprint.
  // This is approximate since items may have moved after sprint completion.

  if (completedSprints.length === 0) {
    return (
      <Section title={t('reports.velocity')}>
        <p className="text-sm text-gray-400">
          {t('reports.noCompletedSprints')}
        </p>
      </Section>
    );
  }

  const velocities = completedSprints.map((s) => s.velocity ?? 0);
  const maxVelocity = Math.max(...velocities, 1);

  // 3-sprint moving average (only shown when 5+ completed sprints)
  const showMovingAvg = completedSprints.length >= 5;
  const movingAvg: number[] = [];
  if (showMovingAvg) {
    for (let i = 0; i < velocities.length; i++) {
      if (i < 2) {
        movingAvg.push(NaN); // not enough data for a 3-sprint window
      } else {
        movingAvg.push(((velocities[i] ?? 0) + (velocities[i - 1] ?? 0) + (velocities[i - 2] ?? 0)) / 3);
      }
    }
  }

  return (
    <Section title={t('reports.velocity')} subtitle={t('reports.velocitySubtitle')}>
      {/* Chart area: bars with SVG trend overlay */}
      <div className="relative">
        {/* Bar chart */}
        <div className="flex items-end gap-3 h-40">
          {completedSprints.map((sprint) => {
            const velocity = sprint.velocity ?? 0;
            const height = maxVelocity > 0 ? (velocity / maxVelocity) * 100 : 0;
            return (
              <div key={sprint.id} className="flex flex-col items-center gap-1 flex-1 min-w-[60px]">
                <span className="text-xs font-medium text-gray-700">{velocity}</span>
                <div
                  className="w-full rounded-t bg-brand-500 transition-all"
                  style={{ height: `${height}%`, minHeight: velocity > 0 ? 4 : 0 }}
                />
                <span className="text-[10px] text-gray-400 truncate w-full text-center">
                  {sprint.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* SVG trend line overlay */}
        {completedSprints.length >= 2 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%' }}
          >
            {(() => {
              const count = completedSprints.length;
              // The bar area excludes the top label (~16px) and bottom label (~16px).
              // Full container is h-40 = 160px. We compute in percent of the container.
              const topOffset = 10; // % from top (label area)
              const bottomOffset = 10; // % from bottom (name label area)
              const barAreaPct = 100 - topOffset - bottomOffset;

              // X positions: center of each bar (evenly spaced with gap)
              // Each bar is flex-1 within a gap-3 flex container.
              // Approximate center: (i + 0.5) / count * 100%
              const xPct = (i: number) => ((i + 0.5) / count) * 100;
              // Y positions: map velocity to the bar area
              const yPct = (v: number) => {
                const ratio = maxVelocity > 0 ? v / maxVelocity : 0;
                return topOffset + barAreaPct * (1 - ratio);
              };

              // Build velocity trend points
              const trendPoints = velocities
                .map((v, i) => `${xPct(i)}%,${yPct(v)}%`)
                .join(' ');

              // Build moving average points (skip NaN entries)
              const maPoints = showMovingAvg
                ? movingAvg
                    .map((v, i) => (Number.isNaN(v) ? null : `${xPct(i)}%,${yPct(v)}%`))
                    .filter(Boolean)
                    .join(' ')
                : '';

              return (
                <>
                  {/* Velocity trend line */}
                  <polyline
                    points={trendPoints}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* Data point dots */}
                  {velocities.map((v, i) => (
                    <circle
                      key={i}
                      cx={`${xPct(i)}%`}
                      cy={`${yPct(v)}%`}
                      r="4"
                      fill="#4f46e5"
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  ))}
                  {/* 3-sprint moving average (dashed) */}
                  {showMovingAvg && maPoints && (
                    <polyline
                      points={maPoints}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ backgroundColor: '#7c3aed' }} />
          {t('reports.velocity')}
        </span>
        {completedSprints.length >= 2 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ backgroundColor: '#4f46e5' }} />
            {t('reports.trend')}
          </span>
        )}
        {showMovingAvg && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ borderTop: '2px dashed #f59e0b' }} />
            {t('reports.threeSprintAvg')}
          </span>
        )}
      </div>

      {completedSprints.length >= 3 && (
        <p className="mt-2 text-xs text-gray-500">
          {t('reports.avgVelocity')}{' '}
          <strong>
            {Math.round(
              completedSprints.reduce((s, sp) => s + (sp.velocity ?? 0), 0) / completedSprints.length,
            )}
          </strong>{' '}
          {t('reports.pointsPerSprint')}
        </p>
      )}
    </Section>
  );
}

// --- Sprint Progress ---
function SprintProgress({
  sprint,
  items,
  allItems,
}: {
  sprint: import('@projecta/types').Sprint;
  items: WorkItem[];
  allItems: WorkItem[];
}) {
  const { t } = useTranslation();
  const statusCounts = useMemo(() => {
    const counts: Record<string, { count: number; points: number }> = {
      done: { count: 0, points: 0 },
      in_review: { count: 0, points: 0 },
      in_progress: { count: 0, points: 0 },
      ready: { count: 0, points: 0 },
      backlog: { count: 0, points: 0 },
    };
    for (const item of items) {
      const bucket = counts[item.status] ?? { count: 0, points: 0 };
      bucket.count++;
      bucket.points += item.storyPoints ?? 0;
      counts[item.status] = bucket;
    }
    return counts;
  }, [items]);

  const totalPoints = Object.values(statusCounts).reduce((s, c) => s + c.points, 0);
  const donePoints = statusCounts['done']?.points ?? 0;
  const pct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  const daysLeft = sprint.endDate
    ? Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <Section title={t('reports.sprintProgress', { name: sprint.name })} subtitle={sprint.goal ?? undefined}>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1">
          <div className="flex h-4 rounded-full overflow-hidden bg-gray-200">
            {[
              { key: 'done', color: 'bg-green-500' },
              { key: 'in_review', color: 'bg-amber-400' },
              { key: 'in_progress', color: 'bg-brand-500' },
              { key: 'ready', color: 'bg-blue-300' },
            ].map(({ key, color }) => {
              const segPct = totalPoints > 0
                ? ((statusCounts[key]?.points ?? 0) / totalPoints) * 100
                : 0;
              return segPct > 0 ? (
                <div key={key} className={`${color}`} style={{ width: `${segPct}%` }} title={`${key}: ${statusCounts[key]?.points ?? 0} pts`} />
              ) : null;
            })}
          </div>
        </div>
        <span className="text-sm font-semibold text-gray-900">{pct}%</span>
      </div>

      <div className="flex gap-6 text-xs text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{t('reports.done', { points: statusCounts['done']?.points ?? 0 })}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-brand-500 mr-1" />{t('reports.inProgress', { points: statusCounts['in_progress']?.points ?? 0 })}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />{t('reports.inReview', { points: statusCounts['in_review']?.points ?? 0 })}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />{t('reports.remaining', { points: totalPoints - donePoints })}</span>
        {daysLeft !== null && <span className="ml-auto font-medium">{t('reports.daysLeft', { count: daysLeft })}</span>}
      </div>
    </Section>
  );
}

// --- Epic Progress ---
function EpicProgress({
  epics,
  items,
  projectId,
}: {
  epics: import('@projecta/types').Epic[];
  items: WorkItem[];
  projectId: string;
}) {
  const { t } = useTranslation();

  if (epics.length === 0) {
    return (
      <Section title={t('reports.epicProgress')}>
        <p className="text-sm text-gray-400">{t('reports.noEpics')}</p>
      </Section>
    );
  }

  return (
    <Section title={t('reports.epicProgress')} subtitle={t('reports.epicProgressSubtitle')}>
      <div className="space-y-3">
        {epics.map((epic) => {
          const stories = items.filter((i) => i.epicId === epic.id && i.type === 'story');
          const total = stories.length;
          const done = stories.filter((s) => s.status === 'done').length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <div key={epic.id}>
              <div className="flex items-center justify-between mb-1">
                <Link
                  to="/p/$projectId/epics/$epicId"
                  params={{ projectId, epicId: epic.id }}
                  className="text-sm font-medium text-gray-900 hover:text-brand-700"
                >
                  {epic.title}
                </Link>
                <span className="text-xs text-gray-500">{t('reports.stories', { done, total, pct })}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// --- Team Workload ---
function TeamWorkload({
  items,
  allItems,
  members,
}: {
  items: WorkItem[];
  allItems: WorkItem[];
  members: import('../../hooks/use-project-members').ProjectMember[];
}) {
  const { t } = useTranslation();
  const workload = useMemo(() => {
    const map = new Map<string, { name: string; role: string; points: number; count: number }>();

    for (const item of items) {
      if (!item.assigneeId) continue;
      const member = members.find((m) => m.id === item.assigneeId);
      if (!member) continue;
      const existing = map.get(member.id) ?? { name: member.name, role: member.jobRole, points: 0, count: 0 };
      existing.points += item.storyPoints ?? 0;
      existing.count++;
      map.set(member.id, existing);
    }

    return [...map.values()].sort((a, b) => b.points - a.points);
  }, [items, members]);

  const maxPoints = Math.max(...workload.map((w) => w.points), 1);

  if (workload.length === 0) {
    return (
      <Section title={t('reports.teamWorkload')}>
        <p className="text-sm text-gray-400">{t('reports.noWorkload')}</p>
      </Section>
    );
  }

  return (
    <Section title={t('reports.teamWorkload')} subtitle={t('reports.teamWorkloadSubtitle')}>
      <div className="space-y-2">
        {workload.map((w) => (
          <div key={w.name} className="flex items-center gap-3">
            <span className="w-32 truncate text-sm text-gray-700">
              {w.name}
              <span className="ml-1 text-[10px] text-gray-400">{w.role.toUpperCase()}</span>
            </span>
            <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded bg-brand-400"
                style={{ width: `${(w.points / maxPoints) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-xs text-gray-600">
              {t('reports.pts', { points: w.points, count: w.count })}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Blocked Items ---
function BlockedReport({
  items,
  blockedItems,
  projectId,
}: {
  items: WorkItem[];
  blockedItems: Set<string>;
  projectId: string;
}) {
  const { t } = useTranslation();
  const blocked = items.filter((i) => blockedItems.has(i.id));

  return (
    <Section title={t('reports.blockedItems')} subtitle={t('reports.blockedSubtitle', { count: blocked.length })}>
      {blocked.length === 0 ? (
        <p className="text-sm text-green-600">{t('reports.noBlocked')}</p>
      ) : (
        <div className="space-y-2">
          {blocked.map((item) => (
            <Link
              key={item.id}
              to="/p/$projectId/items/$workItemId"
              params={{ projectId, workItemId: item.id }}
              className="flex items-center gap-3 rounded border border-red-200 bg-red-50/50 px-3 py-2 hover:bg-red-50"
            >
              <TypeIcon type={item.type} />
              <span className="flex-1 truncate text-sm text-gray-900">{item.title}</span>
              <StatusBadge status={item.status} />
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

// --- Burndown Chart ---
function BurndownChart({
  projectId,
  sprintId,
  sprintName,
}: {
  projectId: string;
  sprintId: string;
  sprintName: string;
}) {
  const { t } = useTranslation();
  const { data } = useBurndown(projectId, sprintId);

  if (!data || data.days.length === 0) {
    return (
      <Section title={t('reports.burndown', { name: sprintName })}>
        <p className="text-sm text-gray-400">
          {t('reports.noBurndownData')}
        </p>
      </Section>
    );
  }

  const { totalPoints, days } = data;
  const maxPoints = Math.max(totalPoints, 1);
  const chartWidth = 600;
  const chartHeight = 200;
  const paddingLeft = 40;
  const paddingBottom = 30;
  const paddingTop = 10;
  const plotWidth = chartWidth - paddingLeft;
  const plotHeight = chartHeight - paddingBottom - paddingTop;

  const xScale = (i: number) => paddingLeft + (i / Math.max(days.length - 1, 1)) * plotWidth;
  const yScale = (pts: number) => paddingTop + plotHeight - (pts / maxPoints) * plotHeight;

  // Build SVG path for ideal line
  const idealPath = days
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.ideal)}`)
    .join(' ');

  // Build SVG path for actual remaining
  const actualPath = days
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.remaining)}`)
    .join(' ');

  // Today marker
  const today = new Date().toISOString().slice(0, 10);
  const todayIdx = days.findIndex((d) => d.date >= today);

  // Y-axis labels
  const yTicks = [0, Math.round(maxPoints / 2), maxPoints];

  return (
    <Section title={t('reports.burndown', { name: sprintName })} subtitle={t('reports.burndownSubtitle')}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full max-w-2xl">
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={yScale(tick)}
              x2={chartWidth}
              y2={yScale(tick)}
              stroke="#e5e7eb"
              strokeDasharray="4 4"
            />
            <text
              x={paddingLeft - 8}
              y={yScale(tick) + 4}
              textAnchor="end"
              className="fill-gray-400"
              fontSize="10"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Ideal line (dashed gray) */}
        <path d={idealPath} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="6 4" />

        {/* Actual line (solid blue) */}
        <path d={actualPath} fill="none" stroke="#2563eb" strokeWidth="2" />

        {/* Data points on actual line */}
        {days.map((d, i) => (
          <circle
            key={d.date}
            cx={xScale(i)}
            cy={yScale(d.remaining)}
            r="3"
            fill={d.remaining <= d.ideal ? '#22c55e' : '#ef4444'}
            stroke="white"
            strokeWidth="1"
          />
        ))}

        {/* Today marker */}
        {todayIdx >= 0 && todayIdx < days.length && (
          <line
            x1={xScale(todayIdx)}
            y1={paddingTop}
            x2={xScale(todayIdx)}
            y2={chartHeight - paddingBottom}
            stroke="#2563eb"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}

        {/* X-axis date labels (first, middle, last) */}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => {
          const d = days[i];
          if (!d) return null;
          return (
            <text
              key={d.date}
              x={xScale(i)}
              y={chartHeight - 8}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="9"
            >
              {new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-gray-400" style={{ borderTop: '1.5px dashed #9ca3af' }} />
          {t('reports.ideal')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-brand-600" />
          {t('reports.actual')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          {t('reports.onTrack')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          {t('reports.behind')}
        </span>
      </div>
    </Section>
  );
}

// --- Test Coverage ---
function TestCoverage() {
  return (
    <Section title="Test Coverage" subtitle="Import test results to track coverage">
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 space-y-2">
        <p>Test results can be imported from any CI pipeline or test framework:</p>
        <div className="font-mono text-xs bg-gray-50 rounded p-3 space-y-1">
          <p className="text-gray-400"># JUnit XML (Cypress, Playwright, pytest, Jest, etc.)</p>
          <p>curl -X POST {window.location.origin}/api/projects/PROJECT_ID/test-results/junit \</p>
          <p className="pl-4">-H &quot;Authorization: Bearer TOKEN&quot; \</p>
          <p className="pl-4">-H &quot;Content-Type: application/xml&quot; \</p>
          <p className="pl-4">-d @test-results.xml</p>
          <p className="mt-2 text-gray-400"># Webhook (any tool)</p>
          <p>curl -X POST {window.location.origin}/api/projects/PROJECT_ID/test-results/webhook \</p>
          <p className="pl-4">-H &quot;Authorization: Bearer TOKEN&quot; \</p>
          <p className="pl-4">-H &quot;Content-Type: application/json&quot; \</p>
          <p className="pl-4">-d &apos;{'{'}&quot;test_name&quot;:&quot;test_#42_login&quot;,&quot;status&quot;:&quot;pass&quot;,&quot;source&quot;:&quot;cypress&quot;{'}'}&apos;</p>
        </div>
        <p className="text-xs text-gray-400">
          Include <code className="bg-gray-100 px-1 rounded">#42</code> in your test name to auto-link results to story #42.
        </p>
      </div>
    </Section>
  );
}

// --- Section wrapper ---
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="mt-0.5 mb-3 text-xs text-gray-500">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}
