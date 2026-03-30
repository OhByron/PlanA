import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Input, Select } from '@projecta/ui';
import { api } from '../../lib/api-client';

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
    </div>
  );
}
