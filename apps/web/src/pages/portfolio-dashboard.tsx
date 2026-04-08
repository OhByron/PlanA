import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge, cn } from '@projecta/ui';
import { api } from '../lib/api-client';

interface Initiative {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  epicCount: number;
  epicsDone: number;
  storyCount: number;
  storiesDone: number;
  totalPoints: number;
  donePoints: number;
  completionPct: number;
  projects: string[];
}

interface Project {
  id: string;
  name: string;
  team: string;
  totalItems: number;
  doneItems: number;
  completionPct: number;
  openBugs: number;
  criticalBugs: number;
  blockedCount: number;
  avgVelocity: number | null;
  activeSprint: string | null;
  health: 'healthy' | 'at_risk' | 'blocked';
}

interface Summary {
  totalInitiatives: number;
  activeInitiatives: number;
  totalProjects: number;
  totalItems: number;
  doneItems: number;
  overallCompletion: number;
  totalBlocked: number;
  avgVelocityAll: number;
}

function toInitiative(w: Record<string, unknown>): Initiative {
  return {
    id: w.id as string,
    title: w.title as string,
    status: w.status as string,
    priority: w.priority as string,
    startDate: (w.start_date as string) ?? null,
    targetDate: (w.target_date as string) ?? null,
    epicCount: w.epic_count as number,
    epicsDone: w.epics_done as number,
    storyCount: w.story_count as number,
    storiesDone: w.stories_done as number,
    totalPoints: w.total_points as number,
    donePoints: w.done_points as number,
    completionPct: w.completion_pct as number,
    projects: (w.projects as string[]) ?? [],
  };
}

function toProject(w: Record<string, unknown>): Project {
  return {
    id: w.id as string,
    name: w.name as string,
    team: w.team as string,
    totalItems: w.total_items as number,
    doneItems: w.done_items as number,
    completionPct: w.completion_pct as number,
    openBugs: w.open_bugs as number,
    criticalBugs: w.critical_bugs as number,
    blockedCount: w.blocked_count as number,
    avgVelocity: (w.avg_velocity as number) ?? null,
    activeSprint: (w.active_sprint as string) ?? null,
    health: w.health as Project['health'],
  };
}

function toSummary(w: Record<string, unknown>): Summary {
  return {
    totalInitiatives: w.total_initiatives as number,
    activeInitiatives: w.active_initiatives as number,
    totalProjects: w.total_projects as number,
    totalItems: w.total_items as number,
    doneItems: w.done_items as number,
    overallCompletion: w.overall_completion as number,
    totalBlocked: w.total_blocked as number,
    avgVelocityAll: w.avg_velocity_all as number,
  };
}

export function PortfolioDashboardPage() {
  const { t } = useTranslation();
  const { orgId } = useParams({ strict: false }) as { orgId: string };

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', orgId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>>(`/orgs/${orgId}/portfolio`);
      return {
        initiatives: ((raw.initiatives as Record<string, unknown>[]) ?? []).map(toInitiative),
        projects: ((raw.projects as Record<string, unknown>[]) ?? []).map(toProject),
        summary: toSummary((raw.summary as Record<string, unknown>) ?? {}),
      };
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const { initiatives, projects, summary } = data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">{t('portfolio.title') ?? 'Portfolio Dashboard'}</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label={t('portfolio.initiatives') ?? 'Initiatives'} value={`${summary.activeInitiatives} / ${summary.totalInitiatives}`} subtitle={t('portfolio.active') ?? 'active'} />
        <SummaryCard label={t('portfolio.projects') ?? 'Projects'} value={String(summary.totalProjects)} />
        <SummaryCard label={t('portfolio.completion') ?? 'Completion'} value={`${summary.overallCompletion}%`} color={summary.overallCompletion >= 60 ? 'text-green-600' : 'text-amber-600'} />
        <SummaryCard label={t('portfolio.blocked') ?? 'Blocked'} value={String(summary.totalBlocked)} color={summary.totalBlocked > 0 ? 'text-red-600' : 'text-gray-600'} />
      </div>

      {/* Initiative Progress */}
      {initiatives.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {t('portfolio.initiativeProgress') ?? 'Initiative Progress'}
          </h2>
          <div className="space-y-3">
            {initiatives.map((init) => (
              <div key={init.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{init.title}</span>
                    <Badge variant={init.status === 'active' ? 'default' : init.status === 'completed' ? 'success' : 'secondary'}>
                      {init.status}
                    </Badge>
                    <Badge variant={init.priority === 'urgent' ? 'warning' : 'outline'}>
                      {init.priority}
                    </Badge>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{init.completionPct}%</span>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-gray-100 mb-2">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${init.completionPct}%` }}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{init.epicsDone}/{init.epicCount} {t('portfolio.epics') ?? 'epics'}</span>
                  <span>{init.storiesDone}/{init.storyCount} {t('portfolio.stories') ?? 'stories'}</span>
                  <span>{init.donePoints}/{init.totalPoints} {t('portfolio.points') ?? 'pts'}</span>
                  {init.projects.length > 0 && (
                    <span className="text-gray-400">{init.projects.join(', ')}</span>
                  )}
                  {init.targetDate && (
                    <span className="ml-auto">{t('portfolio.target') ?? 'Target'}: {new Date(init.targetDate).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Project Health */}
      {projects.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {t('portfolio.projectHealth') ?? 'Project Health'}
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2">{t('portfolio.project') ?? 'Project'}</th>
                  <th className="px-4 py-2">{t('portfolio.team') ?? 'Team'}</th>
                  <th className="px-4 py-2">{t('portfolio.progress') ?? 'Progress'}</th>
                  <th className="px-4 py-2">{t('portfolio.bugs') ?? 'Bugs'}</th>
                  <th className="px-4 py-2">{t('portfolio.blockedItems') ?? 'Blocked'}</th>
                  <th className="px-4 py-2">{t('portfolio.velocity') ?? 'Velocity'}</th>
                  <th className="px-4 py-2">{t('portfolio.sprint') ?? 'Sprint'}</th>
                  <th className="px-4 py-2">{t('portfolio.healthLabel') ?? 'Health'}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((proj) => (
                  <tr key={proj.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{proj.name}</td>
                    <td className="px-4 py-2 text-gray-500">{proj.team}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${proj.completionPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{proj.completionPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {proj.openBugs > 0 ? (
                        <span className={proj.criticalBugs > 0 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {proj.openBugs}{proj.criticalBugs > 0 && ` (${proj.criticalBugs} critical)`}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {proj.blockedCount > 0 ? (
                        <span className="text-red-500 font-medium">{proj.blockedCount}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{proj.avgVelocity ?? '-'}</td>
                    <td className="px-4 py-2 text-gray-500">{proj.activeSprint ?? '-'}</td>
                    <td className="px-4 py-2">
                      <HealthDot health={proj.health} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string | undefined; color?: string | undefined }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn('text-2xl font-semibold mt-1', color ?? 'text-gray-900')}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

function HealthDot({ health }: { health: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500',
    at_risk: 'bg-amber-500',
    blocked: 'bg-red-500',
  };
  const labels: Record<string, string> = {
    healthy: 'Healthy',
    at_risk: 'At Risk',
    blocked: 'Blocked',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-full', colors[health] ?? 'bg-gray-300')} />
      <span className="text-xs text-gray-600">{labels[health] ?? health}</span>
    </div>
  );
}
