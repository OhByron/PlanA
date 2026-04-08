import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select } from '@projecta/ui';
import { api } from '../../lib/api-client';

const EVENT_TYPES = [
  'work_item.created',
  'work_item.updated',
  'work_item.deleted',
  'comment.created',
  'sprint.updated',
  'sprint_item.added',
  'sprint_item.removed',
  'vote.cast',
  'vote.locked',
  'vote.reset',
];

interface OutboundWebhook {
  id: string;
  projectId: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  description: string | null;
  createdAt: string;
}

interface Delivery {
  id: string;
  eventType: string;
  statusCode: number | null;
  error: string | null;
  attempts: number;
  deliveredAt: string | null;
  createdAt: string;
}

function toWebhook(w: Record<string, unknown>): OutboundWebhook {
  return {
    id: w.id as string,
    projectId: w.project_id as string,
    url: w.url as string,
    eventTypes: w.event_types as string[],
    enabled: w.enabled as boolean,
    description: (w.description as string) ?? null,
    createdAt: w.created_at as string,
  };
}

export function WebhooksSettingsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['outbound-webhooks', projectId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>[]>(`/projects/${projectId}/webhooks`);
      return raw.map(toWebhook);
    },
  });

  if (isLoading) {
    return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8 px-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {t('webhooks.title') ?? 'Outbound Webhooks'}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {t('webhooks.description') ?? 'PlanA will POST event payloads to these URLs when changes occur. Each delivery is signed with HMAC-SHA256.'}
        </p>
      </div>

      {showAdd && (
        <AddWebhookForm
          projectId={projectId}
          onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['outbound-webhooks', projectId] }); }}
        />
      )}

      {webhooks.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400">{t('webhooks.noWebhooks') ?? 'No webhooks configured.'}</p>
      )}

      {webhooks.map((wh) => (
        <WebhookCard key={wh.id} projectId={projectId} webhook={wh} />
      ))}

      {!showAdd && (
        <Button size="sm" onClick={() => setShowAdd(true)}>
          {t('webhooks.addWebhook') ?? 'Add Webhook'}
        </Button>
      )}
    </div>
  );
}

function AddWebhookForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(EVENT_TYPES));
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const raw = await api.post(`/projects/${projectId}/webhooks`, {
        url,
        event_types: Array.from(selectedEvents),
        description: description || null,
      });
      return raw as Record<string, unknown>;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!url) { setError('URL is required'); return; }
    if (selectedEvents.size === 0) { setError('Select at least one event type'); return; }

    try {
      const result = await create.mutateAsync();
      setSecret(result.secret as string);
    } catch {
      setError('Failed to create webhook');
    }
  };

  if (secret) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-green-800">Webhook created</h3>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Secret</label>
          <div className="flex gap-2">
            <code className="flex-1 rounded bg-white border border-gray-200 px-3 py-2 text-xs font-mono text-gray-800 break-all">
              {secret}
            </code>
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(secret)}>
              Copy
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {t('webhooks.secretWarning') ?? 'Save this secret now. It will not be shown again. Use it to verify X-PlanA-Signature headers.'}
        </p>
        <Button size="sm" onClick={onDone}>{t('common.done') ?? 'Done'}</Button>
      </div>
    );
  }

  const toggleEvent = (event: string) => {
    const next = new Set(selectedEvents);
    if (next.has(event)) next.delete(event); else next.add(event);
    setSelectedEvents(next);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Payload URL</label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Description (optional)</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="CI/CD integration" />
      </div>
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">Events</label>
        <div className="grid grid-cols-2 gap-1">
          {EVENT_TYPES.map((evt) => (
            <label key={evt} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedEvents.has(evt)}
                onChange={() => toggleEvent(evt)}
                className="rounded border-gray-300"
              />
              {evt}
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={create.isPending}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

function WebhookCard({ projectId, webhook }: { projectId: string; webhook: OutboundWebhook }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showDeliveries, setShowDeliveries] = useState(false);

  const toggle = useMutation({
    mutationFn: () => api.patch(`/projects/${projectId}/webhooks/${webhook.id}`, { enabled: !webhook.enabled }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['outbound-webhooks', projectId] }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/webhooks/${webhook.id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['outbound-webhooks', projectId] }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const raw = await api.post(`/projects/${projectId}/webhooks/${webhook.id}/test`);
      return raw as { success: boolean; status_code?: number; error?: string };
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 break-all">{webhook.url}</p>
          {webhook.description && <p className="text-xs text-gray-500 mt-0.5">{webhook.description}</p>}
          <p className="text-[10px] text-gray-400 mt-1">
            {webhook.eventTypes.join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => toggle.mutate()}
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${webhook.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
          >
            {webhook.enabled ? (t('vcs.enabled') ?? 'Enabled') : (t('vcs.disabled') ?? 'Disabled')}
          </button>
          <Button size="sm" variant="ghost" onClick={() => test.mutate()} disabled={test.isPending}>
            {t('webhooks.test') ?? 'Test'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowDeliveries(!showDeliveries)}>
            {t('webhooks.deliveries') ?? 'Deliveries'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {test.data && (
        <p className={`text-xs ${test.data.success ? 'text-green-600' : 'text-red-600'}`}>
          {test.data.success ? `Test successful (${test.data.status_code})` : `Test failed: ${test.data.error ?? `HTTP ${test.data.status_code}`}`}
        </p>
      )}

      {showDeliveries && <DeliveryLog projectId={projectId} webhookId={webhook.id} />}
    </div>
  );
}

function DeliveryLog({ projectId, webhookId }: { projectId: string; webhookId: string }) {
  const { t } = useTranslation();
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['webhook-deliveries', webhookId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>[]>(`/projects/${projectId}/webhooks/${webhookId}/deliveries`);
      return raw.map((d): Delivery => ({
        id: d.id as string,
        eventType: d.event_type as string,
        statusCode: (d.status_code as number) ?? null,
        error: (d.error as string) ?? null,
        attempts: d.attempts as number,
        deliveredAt: (d.delivered_at as string) ?? null,
        createdAt: d.created_at as string,
      }));
    },
  });

  if (isLoading) return <p className="text-xs text-gray-400">Loading...</p>;
  if (deliveries.length === 0) return <p className="text-xs text-gray-400">{t('webhooks.noDeliveries') ?? 'No deliveries yet.'}</p>;

  return (
    <div className="border-t border-gray-100 pt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="pb-1">Event</th>
            <th className="pb-1">Status</th>
            <th className="pb-1">Attempts</th>
            <th className="pb-1">Time</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-t border-gray-50">
              <td className="py-1 text-gray-700">{d.eventType}</td>
              <td className="py-1">
                {d.deliveredAt ? (
                  <span className="text-green-600">{d.statusCode}</span>
                ) : (
                  <span className="text-red-500">{d.error ?? `HTTP ${d.statusCode}`}</span>
                )}
              </td>
              <td className="py-1 text-gray-500">{d.attempts}</td>
              <td className="py-1 text-gray-400">{new Date(d.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
