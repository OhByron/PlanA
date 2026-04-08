import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@projecta/ui';
import {
  useWorkflowStates,
  useCreateWorkflowState,
  useUpdateWorkflowState,
  useDeleteWorkflowState,
  useReorderWorkflowStates,
} from '../hooks/use-workflow-states';
import type { WorkflowState } from '@projecta/types';

export function OrgWorkflowPage() {
  const { t } = useTranslation();
  const { orgID } = useParams({ strict: false }) as { orgID: string };
  const { data: states = [], isLoading } = useWorkflowStates(orgID);
  const createState = useCreateWorkflowState(orgID);
  const updateState = useUpdateWorkflowState(orgID);
  const deleteState = useDeleteWorkflowState(orgID);
  const reorder = useReorderWorkflowStates(orgID);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setError('');
    try {
      // Insert before Done (last position)
      const donePos = states.find((s) => s.isTerminal)?.position ?? states.length;
      await createState.mutateAsync({
        name: newName.trim(),
        color: newColor,
        position: donePos,
      });
      setNewName('');
      setNewColor('#6B7280');
      setShowAdd(false);
    } catch {
      setError(t('workflow.createFailed') ?? 'Failed to create state');
    }
  };

  const handleDelete = async (state: WorkflowState) => {
    setError('');
    try {
      await deleteState.mutateAsync(state.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      setError(msg);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 1) return;
    const ids = states.map((s) => s.id);
    const temp = ids[index]!;
    ids[index] = ids[index - 1]!;
    ids[index - 1] = temp;
    reorder.mutate(ids);
  };

  const handleMoveDown = (index: number) => {
    if (index >= states.length - 2) return;
    const ids = states.map((s) => s.id);
    const temp = ids[index]!;
    ids[index] = ids[index + 1]!;
    ids[index + 1] = temp;
    reorder.mutate(ids);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8 px-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">
        {t('workflow.title') ?? 'Workflow States'}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {t('workflow.description') ?? 'Define the states that work items move through. Backlog and Done are always present.'}
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {states.map((state, index) => (
          <div
            key={state.id}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            {/* Color swatch */}
            <input
              type="color"
              value={state.color}
              onChange={(e) =>
                updateState.mutate({ stateId: state.id, data: { color: e.target.value } })
              }
              disabled={state.isInitial || state.isTerminal}
              className="h-6 w-6 cursor-pointer rounded border-0"
              title={t('workflow.changeColor') ?? 'Change color'}
            />

            {/* Name */}
            <span className="flex-1 text-sm font-medium text-gray-900">
              {t(`status.${state.slug}`, { defaultValue: state.name })}
            </span>

            {/* Locked badge for bookends */}
            {(state.isInitial || state.isTerminal) && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">
                {t('workflow.locked') ?? 'Locked'}
              </span>
            )}

            {/* Move buttons (not for bookends) */}
            {!state.isInitial && !state.isTerminal && (
              <>
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index <= 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  title={t('workflow.moveUp') ?? 'Move up'}
                >
                  &#9650;
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index >= states.length - 2}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  title={t('workflow.moveDown') ?? 'Move down'}
                >
                  &#9660;
                </button>
                <button
                  onClick={() => handleDelete(state)}
                  className="text-red-400 hover:text-red-600"
                  title={t('common.delete') ?? 'Delete'}
                >
                  &#10005;
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add state form */}
      {showAdd ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-6 w-6 cursor-pointer rounded border-0"
          />
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('workflow.stateName') ?? 'State name'}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <Button size="sm" onClick={handleAdd} disabled={createState.isPending}>
            {t('common.save') ?? 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
            {t('common.cancel') ?? 'Cancel'}
          </Button>
        </div>
      ) : (
        <Button className="mt-4" size="sm" onClick={() => setShowAdd(true)}>
          {t('workflow.addState') ?? 'Add State'}
        </Button>
      )}
    </div>
  );
}
