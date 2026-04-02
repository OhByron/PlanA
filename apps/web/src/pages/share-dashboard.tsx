import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface DashboardData {
  project: { name: string; description: string | null };
  sprint?: {
    name: string;
    goal: string | null;
    start_date: string;
    end_date: string;
    total_items: number;
    done_items: number;
    total_points: number;
    done_points: number;
  };
  completed: Array<{ title: string; type: string; done_at: string }>;
  defects: { open: number; closed: number };
  velocity: Array<{ name: string; velocity: number }>;
  progress: { total_stories: number; done_stories: number };
  tests: { total: number; passed: number; failed: number };
}

export function ShareDashboardPage() {
  const { t } = useTranslation();
  const { token } = useParams({ strict: false }) as { token: string };

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['share-dashboard', token],
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}/dashboard`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t('shareDashboard.invalidLink'));
      }
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t('shareDashboard.invalidLink')}</h1>
          <p className="mt-2 text-gray-500">{(error as Error)?.message || t('shareDashboard.invalidLink')}</p>
        </div>
      </div>
    );
  }

  const progressPct = data.progress.total_stories > 0
    ? Math.round((data.progress.done_stories / data.progress.total_stories) * 100)
    : 0;

  const sprintPct = data.sprint && data.sprint.total_points > 0
    ? Math.round((data.sprint.done_points / data.sprint.total_points) * 100)
    : 0;

  const testPassRate = data.tests.total > 0
    ? Math.round((data.tests.passed / data.tests.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-blue-600">Plan<span className="text-gray-900">A</span></span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">{t('shareDashboard.title')}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{data.project.name}</h1>
          {data.project.description && (
            <p className="mt-1 text-sm text-gray-500">{data.project.description}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label={t('shareDashboard.storyProgress')} value={`${progressPct}%`} detail={`${data.progress.done_stories} of ${data.progress.total_stories} stories`} />
          <MetricCard label={t('shareDashboard.openDefects')} value={String(data.defects.open)} color={data.defects.open > 0 ? 'red' : 'green'} />
          <MetricCard label="Test Pass Rate" value={`${testPassRate}%`} detail={`${data.tests.total} tests`} color={testPassRate >= 90 ? 'green' : testPassRate >= 70 ? 'yellow' : 'red'} />
          <MetricCard label="Tests Run" value={String(data.tests.total)} detail={`${data.tests.failed} failing`} />
        </div>

        {/* Sprint progress */}
        {data.sprint && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">{t('shareDashboard.activeSprint')}: {data.sprint.name}</h2>
            {data.sprint.goal && <p className="text-sm text-gray-500 mt-1">{data.sprint.goal}</p>}
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>{data.sprint.done_points} of {data.sprint.total_points} {t('shareDashboard.points').toLowerCase()}</span>
                <span>{sprintPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${sprintPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {data.sprint.done_items} of {data.sprint.total_items} {t('shareDashboard.items').toLowerCase()} complete
              </p>
            </div>
          </section>
        )}

        {/* Velocity */}
        {data.velocity && data.velocity.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">{t('shareDashboard.sprintVelocity')}</h2>
            <div className="mt-3 flex items-end gap-3 h-32">
              {data.velocity.map((v, i) => {
                const max = Math.max(...data.velocity.map((x) => x.velocity || 0), 1);
                const height = ((v.velocity || 0) / max) * 100;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-medium text-gray-700">{v.velocity}</span>
                    <div
                      className="w-full rounded-t bg-blue-500"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    <span className="text-xs text-gray-400 truncate w-full text-center">{v.name}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recently completed */}
        {data.completed && data.completed.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">{t('shareDashboard.recentlyCompleted')}</h2>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {data.completed.slice(0, 10).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.type === 'bug' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.type}
                  </span>
                  <span className="flex-1 text-sm text-gray-900">{item.title}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(item.done_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-12 border-t border-gray-200 pt-6 text-center">
          <p className="text-xs text-gray-400">
            {t('shareDashboard.poweredBy')} &middot; This is a read-only stakeholder view
          </p>
        </footer>
      </main>
    </div>
  );
}

function MetricCard({ label, value, detail, color }: {
  label: string;
  value: string;
  detail?: string;
  color?: 'green' | 'red' | 'yellow';
}) {
  const colorMap = {
    green: 'text-green-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ? colorMap[color] : 'text-gray-900'}`}>{value}</p>
      {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
    </div>
  );
}
