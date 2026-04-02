import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select } from '@projecta/ui';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useNavigationTree } from '../hooks/use-orgs';

export function CreateTeamDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: tree = [] } = useNavigationTree();
  const qc = useQueryClient();

  const [orgId, setOrgId] = useState('');
  const [name, setName] = useState('');

  const effectiveOrgId = orgId || (tree.length === 1 ? tree[0]!.id : '');

  const create = useMutation({
    mutationFn: async () => {
      await api.post(`/orgs/${effectiveOrgId}/teams`, { name: name.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
      setName('');
      setOpen(false);
    },
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        {t('createTeam.button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('createTeam.title')}</h2>
            <div className="space-y-3">
              {tree.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">{t('createTeam.organisationLabel')}</label>
                  <Select value={effectiveOrgId} onChange={(e) => setOrgId(e.target.value)}>
                    <option value="">{t('createTeam.selectOrg')}</option>
                    {tree.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createTeam.teamNameLabel')}</label>
                <Input
                  autoFocus
                  placeholder={t('createTeam.teamNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) create.mutate(); }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!name.trim() || !effectiveOrgId || create.isPending}
                >
                  {t('common.create')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
