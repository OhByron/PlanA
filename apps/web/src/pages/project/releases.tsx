import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Badge } from '@projecta/ui';
import { useReleases, useCreateRelease } from '../../hooks/use-releases';
import { useSprints } from '../../hooks/use-sprints';

export function ReleasesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: releases = [], isLoading } = useReleases(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const createRelease = useCreateRelease(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [selectedSprints, setSelectedSprints] = useState<Set<string>>(new Set());

  const completedSprints = sprints.filter((s) => s.status === 'completed');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createRelease.mutateAsync({
      name: name.trim(),
      version: version.trim() || undefined,
      sprint_ids: Array.from(selectedSprints),
    });
    setName('');
    setVersion('');
    setSelectedSprints(new Set());
    setShowCreate(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <Badge variant="secondary">Draft</Badge>;
      case 'published': return <Badge variant="success">Published</Badge>;
      case 'archived': return <Badge variant="outline">Archived</Badge>;
      default: return null;
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">{t('releases.title') ?? 'Releases'}</h1>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? t('common.cancel') : (t('releases.create') ?? 'New Release')}
        </Button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t('releases.name') ?? 'Name'}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 3 Release" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t('releases.version') ?? 'Version'}</label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.2.0" />
            </div>
          </div>

          {completedSprints.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-600">{t('releases.includeSprints') ?? 'Include sprints'}</label>
              <div className="space-y-1">
                {completedSprints.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSprints.has(s.id)}
                      onChange={() => {
                        const next = new Set(selectedSprints);
                        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                        setSelectedSprints(next);
                      }}
                      className="rounded border-gray-300"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || createRelease.isPending}>
              {t('releases.create') ?? 'Create'}
            </Button>
          </div>
        </div>
      )}

      {releases.length === 0 && !showCreate && (
        <p className="text-sm text-gray-400 py-8 text-center">{t('releases.noReleases') ?? 'No releases yet. Create one to group completed work.'}</p>
      )}

      <div className="space-y-3">
        {releases.map((rel) => (
          <Link
            key={rel.id}
            to="/p/$projectId/releases/$releaseId"
            params={{ projectId, releaseId: rel.id }}
            className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{rel.name}</span>
                  {rel.version && <span className="text-xs text-gray-400">v{rel.version}</span>}
                  {statusBadge(rel.status)}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {rel.itemCount} items
                  {rel.publishedAt && ` / Published ${new Date(rel.publishedAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className="text-gray-300">&rarr;</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
