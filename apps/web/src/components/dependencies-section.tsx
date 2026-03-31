import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, Select, Input } from '@projecta/ui';
import type { WorkItem } from '@projecta/types';
import type { UseMutationResult } from '@tanstack/react-query';
import type { Dependency } from '../hooks/use-dependencies';
import type { WorkItemLink } from '../hooks/use-links';
import { ContextHelp } from './context-help';

export interface DependenciesSectionProps {
  projectId: string;
  workItemId: string;
  dependencies: Dependency[];
  createDep: UseMutationResult<Dependency, Error, { target_id: string; type: string }>;
  deleteDep: UseMutationResult<void, Error, string>;
  links: WorkItemLink[];
  createLink: UseMutationResult<WorkItemLink, Error, { label: string; url: string }>;
  deleteLink: UseMutationResult<void, Error, string>;
  allItems: WorkItem[];
}

export function DependenciesSection({
  projectId,
  workItemId,
  dependencies,
  createDep,
  deleteDep,
  links,
  createLink,
  deleteLink,
  allItems,
}: DependenciesSectionProps) {
  const [showDepForm, setShowDepForm] = useState(false);
  const [depTargetId, setDepTargetId] = useState('');
  const [depType, setDepType] = useState<'depends_on' | 'relates_to'>('depends_on');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const submitLink = () => {
    if (linkLabel.trim() && linkUrl.trim()) {
      createLink.mutate({ label: linkLabel.trim(), url: linkUrl.trim() }, {
        onSuccess: () => { setLinkLabel(''); setLinkUrl(''); setShowLinkForm(false); }
      });
    }
  };

  return (
    <>
      {/* Dependencies */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Dependencies
            </h2>
            <ContextHelp>
              Dependencies track relationships between items.
              <strong> "Depends on"</strong> means this item can't proceed until the
              target is complete. <strong>"Relates to"</strong> is an informational link.
            </ContextHelp>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowDepForm(!showDepForm)}>
            + Add
          </Button>
        </div>

        {dependencies.length === 0 && !showDepForm && (
          <p className="text-sm text-gray-400">No dependencies.</p>
        )}

        {dependencies.map((dep) => {
          const isSource = dep.sourceId === workItemId;
          const linkedId = isSource ? dep.targetId : dep.sourceId;
          const label = isSource
            ? dep.type === 'depends_on' ? 'Depends on' : 'Relates to'
            : dep.type === 'depends_on' ? 'Depended on by' : 'Relates to';

          return (
            <div key={dep.id} className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-xs font-medium text-gray-500 w-28 shrink-0">{label}</span>
              <Link
                to="/p/$projectId/items/$workItemId"
                params={{ projectId, workItemId: linkedId }}
                className="flex-1 truncate text-sm font-medium text-brand-600 hover:text-brand-800"
              >
                {dep.targetTitle}
              </Link>
              <button
                onClick={() => deleteDep.mutate(dep.id)}
                className="text-gray-400 hover:text-red-500"
                title="Remove"
                aria-label="Remove dependency"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}

        {showDepForm && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
            <div className="flex gap-2">
              <Select
                value={depType}
                onChange={(e) => setDepType(e.target.value as 'depends_on' | 'relates_to')}
                className="w-36"
                aria-label="Dependency type"
              >
                <option value="depends_on">Depends on</option>
                <option value="relates_to">Relates to</option>
              </Select>
              <Select
                value={depTargetId}
                onChange={(e) => setDepTargetId(e.target.value)}
                className="flex-1"
                aria-label="Target work item"
              >
                <option value="">Select an item...</option>
                {allItems
                  .filter((i) => i.id !== workItemId)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      [{i.type[0]!.toUpperCase()}] {i.title}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!depTargetId}
                onClick={() => {
                  createDep.mutate(
                    { target_id: depTargetId, type: depType },
                    { onSuccess: () => { setDepTargetId(''); setShowDepForm(false); } },
                  );
                }}
              >
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDepForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Links */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Links</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowLinkForm(!showLinkForm)}>
            + Add Link
          </Button>
        </div>

        {links.length === 0 && !showLinkForm && (
          <p className="text-sm text-gray-400">No links yet.</p>
        )}

        {links.map((link) => (
          <div key={link.id} className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-sm text-brand-600 hover:text-brand-800"
            >
              {link.label}
            </a>
            <span className="text-xs text-gray-400 truncate max-w-[200px]">{link.url}</span>
            <button
              onClick={() => deleteLink.mutate(link.id)}
              className="text-gray-400 hover:text-red-500"
              title="Remove"
              aria-label="Remove link"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {showLinkForm && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Label (e.g. GitHub PR, Figma, Test results, Docs)"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                className="flex-1"
                aria-label="Link label"
              />
              <Input
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="flex-1"
                aria-label="Link URL"
                onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); }}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitLink} disabled={!linkLabel.trim() || !linkUrl.trim()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowLinkForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
