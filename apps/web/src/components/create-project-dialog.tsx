import { useState } from 'react';
import { Button, Input, Textarea, Select } from '@projecta/ui';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useNavigationTree } from '../hooks/use-orgs';

export function CreateProjectDialog() {
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
        + New Project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Project</h2>
            <div className="space-y-3">
              {tree.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Organization</label>
                  <Select value={effectiveOrgId} onChange={(e) => { setOrgId(e.target.value); setTeamId(''); }}>
                    <option value="">Select org...</option>
                    {tree.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </div>
              )}
              {effectiveTeams.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Team</label>
                  <Select value={effectiveTeamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">Select team...</option>
                    {effectiveTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Project Name</label>
                <Input
                  autoFocus
                  placeholder="e.g. PlanA MVP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) create.mutate(); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
                <Textarea
                  placeholder="What is this project about?"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Methodology</label>
                <Select value={methodology} onChange={(e) => setMethodology(e.target.value)}>
                  <option value="scrum">Scrum</option>
                  <option value="kanban">Kanban</option>
                  <option value="shape_up">Shape Up</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!name.trim() || !effectiveOrgId || !effectiveTeamId || create.isPending}
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
