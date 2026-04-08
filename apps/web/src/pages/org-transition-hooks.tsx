import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Select } from '@projecta/ui';
import { useWorkflowStates } from '../hooks/use-workflow-states';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface TransitionHook {
  id: string;
  orgId: string;
  triggerStateId: string;
  stateName: string;
  stateSlug: string;
  stateColor: string;
  actionType: string;
  config: { role?: string };
  createdAt: string;
}

const JOB_ROLES = ['pm', 'po', 'dev', 'qe', 'bsa', 'ba', 'ux'];

export function OrgTransitionHooksPage() {
  const { t } = useTranslation();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const { data: states = [] } = useWorkflowStates(orgId);
  const qc = useQueryClient();

  const { data: hooks = [] } = useQuery({
    queryKey: ['transition-hooks', orgId],
    queryFn: async (): Promise<TransitionHook[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/orgs/${orgId}/transition-hooks`);
      return raw.map((h) => ({
        id: h.id as string,
        orgId: h.org_id as string,
        triggerStateId: h.trigger_state_id as string,
        stateName: h.state_name as string,
        stateSlug: h.state_slug as string,
        stateColor: h.state_color as string,
        actionType: h.action_type as string,
        config: (h.config as { role?: string }) ?? {},
        createdAt: h.created_at as string,
      }));
    },
    enabled: !!orgId,
  });

  const createHook = useMutation({
    mutationFn: async (data: { trigger_state_id: string; action_type: string; config: Record<string, string> }) => {
      await api.post(`/orgs/${orgId}/transition-hooks`, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['transition-hooks', orgId] }),
  });

  const deleteHook = useMutation({
    mutationFn: async (hookId: string) => {
      await api.delete(`/orgs/${orgId}/transition-hooks/${hookId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['transition-hooks', orgId] }),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newStateId, setNewStateId] = useState('');
  const [newRole, setNewRole] = useState('qe');

  const handleAdd = async () => {
    if (!newStateId) return;
    await createHook.mutateAsync({
      trigger_state_id: newStateId,
      action_type: 'notify_role',
      config: { role: newRole },
    });
    setShowAdd(false);
    setNewStateId('');
  };

  return (
    <div className="mx-auto max-w-2xl py-8 px-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">
        {t('workflow.hooksTitle') ?? 'Transition Hooks'}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {t('workflow.hooksDescription') ?? 'Notify team members when work items enter a specific state.'}
      </p>

      {hooks.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400">{t('workflow.noHooks') ?? 'No hooks configured.'}</p>
      )}

      <div className="space-y-2">
        {hooks.map((hook) => (
          <div key={hook.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: hook.stateColor }}
            />
            <span className="text-sm text-gray-700">
              {t('workflow.hookRule', {
                state: t(`status.${hook.stateSlug}`, { defaultValue: hook.stateName }),
                role: hook.config.role?.toUpperCase() ?? '?',
                defaultValue: `When item enters {{state}}, notify {{role}}`,
              })}
            </span>
            <span className="flex-1" />
            <button
              onClick={() => deleteHook.mutate(hook.id)}
              className="text-red-400 hover:text-red-600 text-sm"
            >
              {t('common.delete') ?? 'Delete'}
            </button>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <span className="text-sm text-gray-500">{t('workflow.whenEnters') ?? 'When item enters'}</span>
          <Select value={newStateId} onChange={(e) => setNewStateId(e.target.value)} className="w-40">
            <option value="">{t('workflow.selectState') ?? 'Select state...'}</option>
            {states.filter((s) => !s.isInitial).map((s) => (
              <option key={s.id} value={s.id}>
                {t(`status.${s.slug}`, { defaultValue: s.name })}
              </option>
            ))}
          </Select>
          <span className="text-sm text-gray-500">{t('workflow.notify') ?? 'notify'}</span>
          <Select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-28">
            {JOB_ROLES.map((r) => (
              <option key={r} value={r}>{r.toUpperCase()}</option>
            ))}
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!newStateId || createHook.isPending}>
            {t('common.save') ?? 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
            {t('common.cancel') ?? 'Cancel'}
          </Button>
        </div>
      ) : (
        <Button className="mt-4" size="sm" onClick={() => setShowAdd(true)}>
          {t('workflow.addHook') ?? 'Add Hook'}
        </Button>
      )}
    </div>
  );
}
