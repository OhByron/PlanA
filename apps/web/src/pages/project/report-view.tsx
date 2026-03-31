import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button } from '@projecta/ui';
import { api } from '../../lib/api-client';

interface ReportData {
  type: string;
  generated_at: string;
  project: { name: string; description: string | null };
  executive_summary?: string;
  metrics: {
    total_items: number;
    done_items: number;
    total_points: number;
    done_points: number;
    completion_pct: number;
  };
  velocity: Array<{ name: string; velocity: number | null }>;
  epics: Array<{
    title: string;
    total_stories: number;
    done_stories: number;
    total_ac: number;
    test_coverage_pct: number;
  }>;
  defects: { total: number; open: number; resolved: number; critical: number };
  tests: { total: number; passed: number; failed: number; errors: number; skipped: number; pass_rate: number };
  blockers: Array<{ title: string; type: string; blocked_reason: string }>;
}

export function ReportViewPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async (type: 'project' | 'sprint') => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<ReportData>(`/projects/${projectId}/reports/generate`, { type });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Project Report</h1>
        <p className="text-sm text-gray-500">Generate a comprehensive report from your project data.</p>
        <div className="flex gap-3">
          <Button onClick={() => generateReport('project')} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Project Report'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8 print:p-0">
      {/* Print button — hidden when printing */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Button variant="ghost" onClick={() => setReport(null)}>Back</Button>
        <Button onClick={() => window.print()}>Print / Export PDF</Button>
      </div>

      {/* Report header */}
      <div className="mb-8 border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold text-gray-900">{report.project.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {report.type === 'project' ? 'Project Report' : 'Sprint Report'} &middot; Generated {new Date(report.generated_at).toLocaleDateString()}
        </p>
      </div>

      {/* Executive summary */}
      {report.executive_summary && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Executive Summary</h2>
          <div className="prose prose-sm max-w-none text-gray-700">
            {report.executive_summary.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* Metrics */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Project Metrics</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatBox label="Completion" value={`${report.metrics.completion_pct}%`} />
          <StatBox label="Items Done" value={`${report.metrics.done_items} / ${report.metrics.total_items}`} />
          <StatBox label="Points Delivered" value={`${report.metrics.done_points} / ${report.metrics.total_points}`} />
          <StatBox label="Test Pass Rate" value={`${report.tests.pass_rate}%`} />
        </div>
      </section>

      {/* Epics */}
      {report.epics && report.epics.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Epic Breakdown</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="py-2 pr-4">Epic</th>
                <th className="py-2 pr-4">Stories</th>
                <th className="py-2 pr-4">Acceptance Criteria</th>
                <th className="py-2">Test Coverage</th>
              </tr>
            </thead>
            <tbody>
              {report.epics.map((epic, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-900">{epic.title}</td>
                  <td className="py-2 pr-4 text-gray-600">{epic.done_stories} / {epic.total_stories}</td>
                  <td className="py-2 pr-4 text-gray-600">{epic.total_ac}</td>
                  <td className="py-2">
                    <span className={epic.test_coverage_pct >= 80 ? 'text-green-600' : epic.test_coverage_pct >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                      {epic.test_coverage_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Defects */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Defects</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatBox label="Total" value={String(report.defects.total)} />
          <StatBox label="Open" value={String(report.defects.open)} {...(report.defects.open > 0 ? { color: 'red' as const } : {})} />
          <StatBox label="Resolved" value={String(report.defects.resolved)} color="green" />
          <StatBox label="Critical (Open)" value={String(report.defects.critical)} {...(report.defects.critical > 0 ? { color: 'red' as const } : {})} />
        </div>
      </section>

      {/* Test evidence */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Test Evidence</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatBox label="Total Tests" value={String(report.tests.total)} />
          <StatBox label="Passed" value={String(report.tests.passed)} color="green" />
          <StatBox label="Failed" value={String(report.tests.failed)} {...(report.tests.failed > 0 ? { color: 'red' as const } : {})} />
          <StatBox label="Errors" value={String(report.tests.errors)} {...(report.tests.errors > 0 ? { color: 'red' as const } : {})} />
          <StatBox label="Skipped" value={String(report.tests.skipped)} />
        </div>
      </section>

      {/* Blockers */}
      {report.blockers && report.blockers.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Current Blockers</h2>
          <div className="rounded-lg border border-red-200 bg-red-50 divide-y divide-red-100">
            {report.blockers.map((b, i) => (
              <div key={i} className="px-4 py-3">
                <span className="text-sm font-medium text-red-800">{b.title}</span>
                <span className="ml-2 text-xs text-red-600">({b.type})</span>
                <p className="text-xs text-red-700 mt-0.5">{b.blocked_reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Velocity */}
      {report.velocity && report.velocity.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Velocity History</h2>
          <div className="flex items-end gap-3 h-32">
            {report.velocity.map((v, i) => {
              const max = Math.max(...report.velocity.map((x) => x.velocity || 0), 1);
              const height = ((v.velocity || 0) / max) * 100;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-medium text-gray-700">{v.velocity}</span>
                  <div className="w-full rounded-t bg-blue-500" style={{ height: `${height}%`, minHeight: '4px' }} />
                  <span className="text-xs text-gray-400 truncate w-full text-center">{v.name}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 pt-4 text-center print:mt-8">
        <p className="text-xs text-gray-400">
          Generated by PlanA &middot; {new Date(report.generated_at).toLocaleString()}
        </p>
      </footer>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 print:border-gray-300">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
