import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea, Select } from '@projecta/ui';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useNavigationTree } from '../hooks/use-orgs';

export function CreateProjectDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: tree = [] } = useNavigationTree();
  const qc = useQueryClient();

  const [orgId, setOrgId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [methodology, setMethodology] = useState('scrum');

  const effectiveOrgId = orgId || (tree.length === 1 ? tree[0]!.id : '');
  const effectiveTeams = tree.find((o) => o.id === effectiveOrgId)?.teams ?? [];
  const effectiveTeamId = teamId || (effectiveTeams.length === 1 ? effectiveTeams[0]!.id : '');

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { name: name.trim(), methodology };
      if (description.trim()) body.description = description.trim();
      await api.post(`/orgs/${effectiveOrgId}/teams/${effectiveTeamId}/projects`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
      setName('');
      setDescription('');
      setMethodology('scrum');
      setOpen(false);
    },
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        {t('createProject.button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('createProject.title')}</h2>
            <div className="space-y-3">
              {tree.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">{t('createProject.organisationLabel')}</label>
                  <Select value={effectiveOrgId} onChange={(e) => { setOrgId(e.target.value); setTeamId(''); }}>
                    <option value="">{t('createProject.selectOrg')}</option>
                    {tree.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </div>
              )}
              {effectiveTeams.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">{t('createProject.teamLabel')}</label>
                  <Select value={effectiveTeamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">{t('createProject.selectTeam')}</option>
                    {effectiveTeams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createProject.projectNameLabel')}</label>
                <Input
                  autoFocus
                  placeholder={t('createProject.projectNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) create.mutate(); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createProject.descriptionLabel')}</label>
                <Textarea
                  placeholder={t('createProject.descriptionPlaceholder')}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createProject.methodologyLabel')}</label>
                <Select value={methodology} onChange={(e) => setMethodology(e.target.value)}>
                  <option value="scrum">{t('methodology.scrum')}</option>
                  <option value="kanban">{t('methodology.kanban')}</option>
                  <option value="shape_up">{t('methodology.shape_up')}</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!name.trim() || !effectiveOrgId || !effectiveTeamId || create.isPending}
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
