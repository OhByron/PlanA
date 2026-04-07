import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Input, Select } from '@projecta/ui';
import { useTranslation } from 'react-i18next';
import {
  useVCSConnections,
  useCreateVCSConnection,
  useDeleteVCSConnection,
  useTestVCSConnection,
  type VCSConnection,
} from '../../hooks/use-vcs';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toProject } from '../../lib/api-transforms';

export function VCSSettingsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: connections, isLoading } = useVCSConnections(projectId);

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8 px-6">
      <h1 className="text-lg font-semibold text-gray-900">{t('vcs.title')}</h1>

      <MergeTransitionSection projectId={projectId} />
      <ConnectionsSection
        projectId={projectId}
        connections={connections ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}

// ---------- Merge Transition Config ----------

function MergeTransitionSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>>(`/projects/${projectId}`);
      return toProject(raw);
    },
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentValue = (project as Record<string, unknown> | undefined)?.mergeTransitionStatus as string | null | undefined;

  const handleChange = async (value: string) => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/projects/${projectId}`, {
        merge_transition_status: value || 'disabled',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t('vcs.mergeTransition')}</h2>
      <p className="mb-3 text-xs text-gray-500">{t('vcs.mergeTransitionDesc')}</p>
      <div className="flex items-center gap-3">
        <Select
          value={currentValue ?? 'done'}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
        >
          <option value="done">Done</option>
          <option value="in_review">In Review</option>
          <option value="disabled">{t('vcs.disabled')}</option>
        </Select>
        {saved && <span className="text-xs text-green-600">{t('common.saved')}</span>}
      </div>
    </section>
  );
}

// ---------- Connections List ----------

function ConnectionsSection({
  projectId,
  connections,
  isLoading,
}: {
  projectId: string;
  connections: VCSConnection[];
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);

  if (isLoading) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t('vcs.connections')}</h2>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('vcs.connections')}</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? t('common.cancel') : t('vcs.addConnection')}
        </Button>
      </div>

      {showForm && (
        <AddConnectionForm projectId={projectId} onDone={() => setShowForm(false)} />
      )}

      {connections.length === 0 && !showForm && (
        <p className="text-sm text-gray-500">{t('vcs.noConnections')}</p>
      )}

      {connections.length > 0 && (
        <ul className="space-y-3">
          {connections.map((conn) => (
            <ConnectionCard key={conn.id} projectId={projectId} connection={conn} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Add Connection Form ----------

function AddConnectionForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createConn = useCreateVCSConnection(projectId);
  const [provider, setProvider] = useState('github');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!owner || !repo || !token) {
      setError('Owner, repository, and token are required.');
      return;
    }

    try {
      await createConn.mutateAsync({
        provider,
        owner,
        repo,
        auth_method: 'pat',
        token,
      });
      onDone();
    } catch {
      setError('Failed to create connection. Check your credentials.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t('vcs.provider')}</label>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t('vcs.authMethod')}</label>
          <Select value="pat" disabled>
            <option value="pat">Personal Access Token</option>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Owner</label>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="org-or-user" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t('vcs.repository')}</label>
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="repo-name" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t('vcs.token')}</label>
        <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_... or glpat-..." />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={createConn.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

// ---------- Connection Card ----------

function ConnectionCard({
  projectId,
  connection,
}: {
  projectId: string;
  connection: VCSConnection;
}) {
  const { t } = useTranslation();
  const deleteConn = useDeleteVCSConnection(projectId);
  const testConn = useTestVCSConnection(projectId);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleTest = async () => {
    setTestResult(null);
    const result = await testConn.mutateAsync(connection.id);
    setTestResult(result);
  };

  const handleDelete = async () => {
    await deleteConn.mutateAsync(connection.id);
  };

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ProviderLogo provider={connection.provider} />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {connection.owner}/{connection.repo}
            </p>
            <p className="text-xs text-gray-500">
              {connection.provider} / {connection.authMethod}
              {connection.enabled
                ? <span className="ml-2 text-green-600">{t('vcs.enabled')}</span>
                : <span className="ml-2 text-gray-400">{t('vcs.disabled')}</span>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleTest} disabled={testConn.isPending}>
            {t('vcs.testConnection')}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleteConn.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
      {testResult && (
        <p className={`mt-2 text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
          {testResult.success ? t('vcs.testSuccess') : `${t('vcs.testFailed')}: ${testResult.error}`}
        </p>
      )}
    </li>
  );
}

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === 'github') {
    return (
      <svg className="h-6 w-6 text-gray-700" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }
  return (
    <svg className="h-6 w-6 text-orange-500" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 14.615l2.49-7.66H5.51L8 14.615z" />
      <path d="M8 14.615L5.51 6.955H1.27L8 14.615z" opacity="0.7" />
      <path d="M1.27 6.955l-.87 2.68c-.08.24 0 .51.21.66L8 14.615 1.27 6.955z" />
      <path d="M1.27 6.955h4.24L3.6 1.18c-.09-.27-.47-.27-.56 0L1.27 6.955z" />
      <path d="M8 14.615l2.49-7.66h4.24L8 14.615z" opacity="0.7" />
      <path d="M14.73 6.955l.87 2.68c.08.24 0 .51-.21.66L8 14.615l6.73-7.66z" />
      <path d="M14.73 6.955H10.49l1.91-5.775c.09-.27.47-.27.56 0l1.77 5.775z" />
    </svg>
  );
}
