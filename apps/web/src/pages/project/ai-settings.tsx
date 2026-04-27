import { useState, useEffect, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select, Textarea } from '@projecta/ui';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';
import { toProject } from '../../lib/api-transforms';
import { useLicence, useActivateLicence } from '../../hooks/use-licence';
import { useWorkflowStates, useProjectWorkflowStates } from '../../hooks/use-workflow-states';
import { useMutation } from '@tanstack/react-query';

interface ShareToken {
  id: string;
  token: string;
  label: string;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface AISettings {
  provider: string;
  model: string;
  api_key: string;
  endpoint: string;
}

export function AISettingsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');

  useEffect(() => {
    api.get<AISettings>(`/projects/${projectId}/ai-settings`)
      .then((s) => {
        setSettings(s);
        setProvider(s.provider);
        setModel(s.model);
        setEndpoint(s.endpoint);
        // Don't pre-fill API key — it's masked
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const data: Record<string, string> = { provider, model, endpoint };
      if (apiKey) data.api_key = apiKey; // only send if user entered a new one
      await api.patch(`/projects/${projectId}/ai-settings`, data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const modelSuggestions: Record<string, string[]> = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    openai: ['gpt-4o', 'gpt-4o-mini'],
    azure_openai: ['gpt-4o'],
    ollama: ['gemma4:26b'],
    custom: [],
  };

  // Ollama runs locally and doesn't take an API key.
  const requiresApiKey = provider !== '' && provider !== 'ollama';
  const showsEndpoint = provider === 'azure_openai' || provider === 'custom' || provider === 'ollama';
  const endpointPlaceholder = provider === 'ollama'
    ? 'http://localhost:11434'
    : 'https://your-instance.openai.azure.com/v1';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <LicenceSection />

      <hr className="border-gray-200" />
      <ProjectDetailsSection projectId={projectId} />

      <hr className="border-gray-200" />
      <ProjectSettingsSection projectId={projectId} />

      <hr className="border-gray-200" />
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('aiSettings.title')}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t('aiSettings.description')}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('aiSettings.provider')}</label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); }}>
            <option value="">{t('aiSettings.notConfigured')}</option>
            <option value="ollama">{t('aiSettings.ollama', { defaultValue: 'Ollama (local — Gemma 4)' })}</option>
            <option value="anthropic">{t('aiSettings.anthropic')}</option>
            <option value="openai">{t('aiSettings.openai')}</option>
            <option value="azure_openai">{t('aiSettings.azureOpenai')}</option>
            <option value="custom">{t('aiSettings.custom')}</option>
          </Select>
        </div>

        {provider && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('aiSettings.model')}</label>
              {modelSuggestions[provider]?.length ? (
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">{t('aiSettings.selectModel')}</option>
                  {modelSuggestions[provider]!.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t('aiSettings.modelPlaceholder')}
                />
              )}
            </div>

            {requiresApiKey && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('aiSettings.apiKey')}</label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.api_key ? t('aiSettings.currentKey', { key: settings.api_key }) : t('aiSettings.enterApiKey')}
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t('aiSettings.apiKeyHelp')}
                </p>
              </div>
            )}

            {showsEndpoint && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('aiSettings.endpointUrl')}</label>
                <Input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder={endpointPlaceholder}
                />
                {provider === 'ollama' && (
                  <p className="mt-1 text-xs text-gray-400">
                    {t('aiSettings.ollamaHint', { defaultValue: 'Leave blank to use the bundled Ollama service. The model must be pulled first: ollama pull gemma4:26b' })}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? t('aiSettings.saving') : t('common.save')}
          </Button>
          {saved && <span className="text-sm text-green-600">{t('aiSettings.settingsSaved')}</span>}
        </div>
        </div>
      </section>

      <hr className="border-gray-200" />
      {/* Workflow State Subset */}
      <WorkflowSubsetSection projectId={projectId} />

      <hr className="border-gray-200" />
      {/* Stakeholder Sharing */}
      <ShareTokensSection projectId={projectId} />
    </div>
  );
}

function LicenceSection() {
  const { t } = useTranslation();
  const { data: licence } = useLicence();
  const activate = useActivateLicence();
  const [keyInput, setKeyInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const tierColors: Record<string, string> = {
    community: 'bg-gray-100 text-gray-700',
    professional: 'bg-brand-100 text-brand-700',
    enterprise: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className="mb-10 border-b border-gray-200 pb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-0.5">{t('licence.title')}</h2>
          <p className="text-sm text-gray-500">{t('licence.description')}</p>
        </div>
        {licence && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${tierColors[licence.tier] ?? tierColors.community}`}>
            {licence.tier}
          </span>
        )}
      </div>

      {licence && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>{t('licence.organisation')}: <strong>{licence.organisation}</strong></span>
            {licence.expiresAt && (
              <span className={licence.expired ? 'text-red-500 font-medium' : ''}>
                {licence.expired ? t('licence.expired') : t('licence.expiresOn', { date: new Date(licence.expiresAt).toLocaleDateString() })}
              </span>
            )}
            {licence.tier === 'community' && !licence.expiresAt && (
              <span className="text-gray-400">{t('licence.neverExpires')}</span>
            )}
          </div>
          {licence.expired && (
            <p className="text-xs text-amber-600">{t('licence.expiredNote')}</p>
          )}
        </div>
      )}

      {showInput ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t('licence.keyPlaceholder')}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await activate.mutateAsync(keyInput.trim());
                setKeyInput('');
                setShowInput(false);
              }}
              disabled={!keyInput.trim() || activate.isPending}
            >
              {activate.isPending ? t('licence.activating') : t('licence.activate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowInput(false); setKeyInput(''); }}>
              {t('common.cancel')}
            </Button>
          </div>
          {activate.isError && (
            <p className="text-xs text-red-500">{t('licence.invalidKey')}</p>
          )}
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowInput(true)}>
          {licence?.tier === 'community' ? t('licence.enterKey') : t('licence.changeKey')}
        </Button>
      )}
    </div>
  );
}

const METHODOLOGIES = ['scrum', 'kanban', 'shape_up'] as const;
const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'cancelled'] as const;

function ProjectDetailsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => { const raw = await api.get(`/projects/${projectId}`); return toProject(raw); },
    staleTime: 5 * 60_000,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [methodology, setMethodology] = useState('scrum');
  const [status, setStatus] = useState('active');
  const [dueDate, setDueDate] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showArchiveWarning, setShowArchiveWarning] = useState(false);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setMethodology(project.methodology);
    setStatus(project.status ?? 'active');
    setDueDate(project.dueDate ? new Date(project.dueDate).toISOString().slice(0, 10) : '');
    setContactName(project.contactName ?? '');
    setContactEmail(project.contactEmail ?? '');
    setContactPhone(project.contactPhone ?? '');
  }, [project]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/projects/${projectId}`, {
        name: name.trim(),
        description: description.trim() || null,
        methodology,
        status,
        due_date: dueDate || null,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
      });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-10 border-b border-gray-200 pb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('projectDetails.title')}</h2>
      <p className="text-sm text-gray-500 mb-6">{t('projectDetails.description')}</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('projectDetails.name')}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('projectDetails.desc')}</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('projectDetails.descPlaceholder')} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('projectDetails.methodology')}</label>
            <Select value={methodology} onChange={(e) => setMethodology(e.target.value)}>
              {METHODOLOGIES.map((m) => (
                <option key={m} value={m}>{t(`methodology.${m}`, m)}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('projectDetails.status')}</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`projectStatus.${s}`, s.replace(/_/g, ' '))}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('projectDetails.dueDate')}</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('projectDetails.contact')}</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">{t('projectDetails.contactName')}</label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Project lead" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">{t('projectDetails.contactEmail')}</label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="lead@company.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">{t('projectDetails.contactPhone')}</label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 555-0100" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
            {saving ? t('aiSettings.saving') : t('common.save')}
          </Button>
          {saved && <span className="text-sm text-green-600">{t('aiSettings.settingsSaved')}</span>}
        </div>

        {/* Retention & Archive */}
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('projectDetails.retention')}</h3>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-xs font-medium text-gray-500">{t('projectDetails.retentionDays')}</label>
            <Select
              value={String(project?.retentionDays ?? 365)}
              onChange={(e) => api.patch(`/projects/${projectId}`, { retention_days: Number(e.target.value) }).then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))}
              className="w-36"
            >
              <option value="90">90 {t('projectDetails.days')}</option>
              <option value="180">180 {t('projectDetails.days')}</option>
              <option value="365">1 {t('projectDetails.year')}</option>
              <option value="730">2 {t('projectDetails.years')}</option>
              <option value="1825">5 {t('projectDetails.years')}</option>
            </Select>
            <p className="text-xs text-gray-400">{t('projectDetails.retentionHelp')}</p>
          </div>

          {/* Archive warning modal */}
          {showArchiveWarning && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t('projectDetails.archiveWarningTitle')}</h3>
                <p className="text-sm text-gray-600 mb-3">
                  {t('projectDetails.archiveWarningBody', { name: project?.name })}
                </p>
                <p className="text-xs text-gray-400 mb-4">{t('projectDetails.archiveReversible')}</p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowArchiveWarning(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await api.post(`/projects/${projectId}/archive`, {});
                      qc.invalidateQueries({ queryKey: ['project', projectId] });
                      qc.invalidateQueries({ queryKey: ['nav-tree'] });
                      setShowArchiveWarning(false);
                    }}
                  >
                    {t('projectDetails.confirmArchive')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {project?.archivedAt ? (
            <div className="flex items-center gap-3">
              <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                {t('projectDetails.archivedOn', { date: new Date(project.archivedAt).toLocaleDateString() })}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await api.post(`/projects/${projectId}/unarchive`, {});
                  qc.invalidateQueries({ queryKey: ['project', projectId] });
                  qc.invalidateQueries({ queryKey: ['nav-tree'] });
                }}
              >
                {t('projectDetails.unarchive')}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowArchiveWarning(true)}
            >
              {t('projectDetails.archiveProject')}
            </Button>
          )}
        </div>

        {/* Export / Import */}
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('projectDetails.exportImport')}</h3>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const data = await api.get(`/projects/${projectId}/export`);
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `project-${project?.name ?? projectId}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              {t('projectDetails.exportProject')}
            </Button>
            <p className="text-xs text-gray-400">{t('projectDetails.exportHelp')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => { const raw = await api.get(`/projects/${projectId}`); return toProject(raw); },
    staleTime: 5 * 60_000,
  });

  const [projectMonths, setProjectMonths] = useState<number>(6);
  const [epicWeeks, setEpicWeeks] = useState<number>(6);
  const [sprintWeeks, setSprintWeeks] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!project) return;
    setProjectMonths(project.defaultProjectMonths);
    setEpicWeeks(project.defaultEpicWeeks);
    setSprintWeeks(project.sprintDurationWeeks);
  }, [project]);

  const isDirty = project && (
    projectMonths !== project.defaultProjectMonths ||
    epicWeeks !== project.defaultEpicWeeks ||
    sprintWeeks !== project.sprintDurationWeeks
  );

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/projects/${projectId}`, {
        default_project_months: projectMonths,
        default_epic_weeks: epicWeeks,
        sprint_duration_weeks: sprintWeeks,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-10 border-b border-gray-200 pb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('settings.projectSettings')}</h2>
      <p className="text-sm text-gray-500 mb-6">{t('settings.projectSettingsDesc')}</p>

      <div className="space-y-4">
        {/* Feature / Project duration */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('settings.projectDuration')}</label>
          <div className="flex items-center gap-3">
            <Select
              value={String(projectMonths)}
              onChange={(e) => setProjectMonths(Number(e.target.value))}
              className="w-36"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18].map((m) => (
                <option key={m} value={m}>{m} {t('settings.months')}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-400">{t('settings.projectDurationHelp')}</p>
          </div>
        </div>

        {/* Epic duration */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('settings.epicDuration')}</label>
          <div className="flex items-center gap-3">
            <Select
              value={String(epicWeeks)}
              onChange={(e) => setEpicWeeks(Number(e.target.value))}
              className="w-36"
            >
              {[2, 3, 4, 5, 6, 8, 10, 12].map((w) => (
                <option key={w} value={w}>{w} {t('settings.weeks')}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-400">{t('settings.epicDurationHelp')}</p>
          </div>
        </div>

        {/* Sprint duration */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('settings.sprintDuration')}</label>
          <div className="flex items-center gap-3">
            <Select
              value={String(sprintWeeks)}
              onChange={(e) => setSprintWeeks(Number(e.target.value))}
              className="w-36"
            >
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>{w} {t('settings.weeks')}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-400">{t('settings.sprintDurationHelp')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" onClick={save} disabled={saving || !isDirty}>
            {saving ? t('aiSettings.saving') : t('common.save')}
          </Button>
          {saved && <span className="text-sm text-green-600">{t('aiSettings.settingsSaved')}</span>}
        </div>
      </div>
    </div>
  );
}

function ShareTokensSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newExpiry, setNewExpiry] = useState('90');
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  const fetchTokens = useCallback(async () => {
    try {
      const data = await api.get<ShareToken[]>(`/projects/${projectId}/share-tokens`);
      setTokens(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  const createToken = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      await api.post(`/projects/${projectId}/share-tokens`, {
        label: newLabel.trim(),
        expires_in_days: newExpiry ? Number(newExpiry) : null,
      });
      setNewLabel('');
      await fetchTokens();
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (tokenId: string) => {
    await api.post(`/projects/${projectId}/share-tokens/${tokenId}/revoke`, {});
    await fetchTokens();
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${baseUrl}/share/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const activeTokens = tokens.filter((t) => !t.revoked_at);
  const revokedTokens = tokens.filter((t) => t.revoked_at);

  return (
    <div className="mt-10 border-t border-gray-200 pt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('aiSettings.stakeholderSharing')}</h2>
      <p className="text-sm text-gray-500 mb-6">
        {t('aiSettings.sharingDescription')}
      </p>

      {/* Create new token */}
      <div className="mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('aiSettings.label')}</label>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('aiSettings.labelPlaceholder')}
            aria-label="Share link label"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('aiSettings.expiresIn')}</label>
          <Select value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} aria-label="Expiry period">
            <option value="30">{t('aiSettings.days30')}</option>
            <option value="90">{t('aiSettings.days90')}</option>
            <option value="180">{t('aiSettings.days180')}</option>
            <option value="365">{t('aiSettings.year1')}</option>
            <option value="">{t('aiSettings.never')}</option>
          </Select>
        </div>
        <Button onClick={createToken} disabled={creating || !newLabel.trim()}>
          {creating ? t('aiSettings.creating') : t('aiSettings.createLink')}
        </Button>
      </div>

      {loading && <p className="text-sm text-gray-400">{t('common.loading')}</p>}

      {/* Active tokens */}
      {activeTokens.length > 0 && (
        <div className="space-y-3">
          {activeTokens.map((tk) => (
            <div key={tk.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{tk.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('aiSettings.created', { date: new Date(tk.created_at).toLocaleDateString() })}
                  {tk.expires_at && ` · ${t('aiSettings.expires', { date: new Date(tk.expires_at).toLocaleDateString() })}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copyLink(tk.token)}>
                {copied === tk.token ? t('aiSettings.copied') : t('aiSettings.copyLink')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => revokeToken(tk.id)}>
                {t('aiSettings.revoke')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {activeTokens.length === 0 && !loading && (
        <p className="text-sm text-gray-400">{t('aiSettings.noActiveLinks')}</p>
      )}

      {/* Revoked tokens */}
      {revokedTokens.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-400 uppercase mb-2">{t('aiSettings.revoked')}</p>
          {revokedTokens.map((tk) => (
            <div key={tk.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 mb-2 opacity-60">
              <div className="flex-1">
                <p className="text-sm text-gray-500 line-through">{tk.label}</p>
                <p className="text-xs text-gray-400">{t('aiSettings.revokedDate', { date: new Date(tk.revoked_at!).toLocaleDateString() })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Workflow State Subset ---

function WorkflowSubsetSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: projectStates = [] } = useProjectWorkflowStates(projectId);
  const qc = useQueryClient();

  // Get org ID from the first project state (they all have the same orgId)
  const orgId = projectStates[0]?.orgId ?? '';
  const { data: allOrgStates = [] } = useWorkflowStates(orgId);

  // Track which states are enabled for this project
  const activeIds = new Set(projectStates.map((s) => s.id));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Check if project is using all org states (no custom subset)
  const isUsingAll = allOrgStates.length > 0 && allOrgStates.length === projectStates.length;

  const saveSubset = useMutation({
    mutationFn: async (stateIds: string[]) => {
      setSaving(true);
      setSaved(false);
      await api.post(`/projects/${projectId}/workflow-states/subset`, { state_ids: stateIds });
    },
    onSettled: () => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['project-workflow-states', projectId] });
    },
  });

  const toggleState = (stateId: string, isInitial: boolean, isTerminal: boolean) => {
    if (isInitial || isTerminal) return; // Can't toggle bookends

    const newActive = new Set(activeIds);
    if (newActive.has(stateId)) {
      newActive.delete(stateId);
    } else {
      newActive.add(stateId);
    }

    // Build ordered list matching org state order
    const ordered = allOrgStates
      .filter((s) => newActive.has(s.id))
      .map((s) => s.id);

    saveSubset.mutate(ordered);
  };

  const resetToAll = () => {
    saveSubset.mutate([]);
  };

  if (allOrgStates.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        {t('workflow.title') ?? 'Workflow States'}
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        {t('projectSettings.workflowSubsetDesc') ?? 'Choose which workflow states this project uses. Backlog and Done are always included.'}
      </p>

      <div className="space-y-1">
        {allOrgStates.map((state) => (
          <label
            key={state.id}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={activeIds.has(state.id)}
              disabled={state.isInitial || state.isTerminal || saving}
              onChange={() => toggleState(state.id, state.isInitial, state.isTerminal)}
              className="rounded border-gray-300"
            />
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: state.color }}
            />
            <span className="text-sm text-gray-700">
              {t(`status.${state.slug}`, { defaultValue: state.name })}
            </span>
            {(state.isInitial || state.isTerminal) && (
              <span className="text-[10px] text-gray-400">{t('workflow.locked') ?? 'Locked'}</span>
            )}
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {!isUsingAll && (
          <Button size="sm" variant="ghost" onClick={resetToAll} disabled={saving}>
            {t('projectSettings.useAllStates') ?? 'Use all states'}
          </Button>
        )}
        {saved && <span className="text-xs text-green-600">{t('common.saved')}</span>}
      </div>
    </div>
  );
}
