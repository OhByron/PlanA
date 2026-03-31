import { useState, useEffect, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Input, Select } from '@projecta/ui';
import { api } from '../../lib/api-client';

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
    custom: [],
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Configuration</h2>
      <p className="text-sm text-gray-500 mb-6">
        Configure an AI provider to enable acceptance criteria suggestions, story decomposition,
        and release note drafting. You provide your own API key — PlanA doesn't store or proxy
        through any shared account.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Provider</label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); }}>
            <option value="">Not configured</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT-4)</option>
            <option value="azure_openai">Azure OpenAI</option>
            <option value="custom">Custom (OpenAI-compatible)</option>
          </Select>
        </div>

        {provider && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Model</label>
              {modelSuggestions[provider]?.length ? (
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Select model...</option>
                  {modelSuggestions[provider]!.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Model ID (e.g. my-custom-model)"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">API Key</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.api_key ? `Current: ${settings.api_key}` : 'Enter API key'}
              />
              <p className="mt-1 text-xs text-gray-400">
                Your key is stored encrypted per-project. Leave blank to keep the current key.
              </p>
            </div>

            {(provider === 'azure_openai' || provider === 'custom') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Endpoint URL</label>
                <Input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://your-instance.openai.azure.com/v1"
                />
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {saved && <span className="text-sm text-green-600">Settings saved</span>}
        </div>
      </div>

      {/* Stakeholder Sharing */}
      <ShareTokensSection projectId={projectId} />
    </div>
  );
}

function ShareTokensSection({ projectId }: { projectId: string }) {
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
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Stakeholder Sharing</h2>
      <p className="text-sm text-gray-500 mb-6">
        Create shareable links for stakeholders to view a read-only project dashboard.
        No login required — the link is the access.
      </p>

      {/* Create new token */}
      <div className="mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Label</label>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Client, Steering Committee"
            aria-label="Share link label"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-gray-500">Expires in</label>
          <Select value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} aria-label="Expiry period">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
            <option value="">Never</option>
          </Select>
        </div>
        <Button onClick={createToken} disabled={creating || !newLabel.trim()}>
          {creating ? 'Creating...' : 'Create Link'}
        </Button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading...</p>}

      {/* Active tokens */}
      {activeTokens.length > 0 && (
        <div className="space-y-3">
          {activeTokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{t.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Created {new Date(t.created_at).toLocaleDateString()}
                  {t.expires_at && ` · Expires ${new Date(t.expires_at).toLocaleDateString()}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copyLink(t.token)}>
                {copied === t.token ? 'Copied!' : 'Copy Link'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => revokeToken(t.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      {activeTokens.length === 0 && !loading && (
        <p className="text-sm text-gray-400">No active share links.</p>
      )}

      {/* Revoked tokens */}
      {revokedTokens.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-400 uppercase mb-2">Revoked</p>
          {revokedTokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 mb-2 opacity-60">
              <div className="flex-1">
                <p className="text-sm text-gray-500 line-through">{t.label}</p>
                <p className="text-xs text-gray-400">Revoked {new Date(t.revoked_at!).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
