import { useState } from 'react';
import { Button, Input, Textarea } from '@projecta/ui';
import { useCreateSprint } from '../hooks/use-sprints';

interface Props {
  projectId: string;
}

export function CreateSprintDialog({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const create = useCreateSprint(projectId);

  const submit = () => {
    if (!name.trim()) return;
    const data: Record<string, unknown> = { name: name.trim() };
    if (goal.trim()) data.goal = goal.trim();
    if (startDate) data.start_date = startDate;
    if (endDate) data.end_date = endDate;
    create.mutate(data, {
      onSuccess: () => {
        setName('');
        setGoal('');
        setStartDate('');
        setEndDate('');
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New Sprint</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Sprint</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
                <Input
                  autoFocus
                  placeholder="Sprint 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Goal</label>
                <Textarea
                  placeholder="What should this sprint achieve?"
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Start Date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-500">End Date</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={!name.trim() || create.isPending}>
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
