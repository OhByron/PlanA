import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Badge, Textarea } from '@projecta/ui';
import {
  useRelease,
  useUpdateRelease,
  useGenerateNotes,
  useEnhanceNotes,
  usePublishRelease,
  useShareRelease,
  useUnshareRelease,
} from '../../hooks/use-releases';

export function ReleaseDetailPage() {
  const { t } = useTranslation();
  const { projectId, releaseId } = useParams({ strict: false }) as { projectId: string; releaseId: string };
  const { data, isLoading } = useRelease(projectId, releaseId);
  const updateRelease = useUpdateRelease(projectId, releaseId);
  const generateNotes = useGenerateNotes(projectId, releaseId);
  const enhanceNotes = useEnhanceNotes(projectId, releaseId);
  const publishRelease = usePublishRelease(projectId, releaseId);
  const shareRelease = useShareRelease(projectId, releaseId);
  const unshareRelease = useUnshareRelease(projectId, releaseId);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const { release, items, sprints } = data;
  const isDraft = release.status === 'draft';

  const saveNotes = () => {
    updateRelease.mutate({ notes: notesDraft });
    setEditingNotes(false);
  };

  const handleShare = async () => {
    const token = await shareRelease.mutateAsync();
    navigator.clipboard.writeText(`${window.location.origin}/releases/${token}`);
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Back link */}
      <Link
        to="/p/$projectId/releases"
        params={{ projectId }}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block"
      >
        &larr; {t('releases.backToList') ?? 'All releases'}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">{release.name}</h1>
          {release.version && <span className="text-sm text-gray-400">v{release.version}</span>}
          <Badge variant={release.status === 'published' ? 'success' : 'secondary'}>
            {release.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <Button size="sm" onClick={() => publishRelease.mutate()} disabled={publishRelease.isPending}>
              {t('releases.publish') ?? 'Publish'}
            </Button>
          )}
          {release.status === 'published' && !release.shareToken && (
            <Button size="sm" variant="outline" onClick={handleShare} disabled={shareRelease.isPending}>
              {t('releases.shareExternally') ?? 'Share externally'}
            </Button>
          )}
          {release.shareToken && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/releases/${release.shareToken}`)}
              >
                {t('releases.copyLink') ?? 'Copy link'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => unshareRelease.mutate()}>
                {t('releases.revokeShare') ?? 'Revoke'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Sprints */}
      {sprints.length > 0 && (
        <div className="mb-4">
          <span className="text-xs font-medium text-gray-500">{t('releases.sprints') ?? 'Sprints'}:</span>
          <span className="ml-2 text-sm text-gray-700">{sprints.map((s) => s.name).join(', ')}</span>
        </div>
      )}

      {/* Items */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {t('releases.items') ?? 'Items'} ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">{t('releases.noItems') ?? 'No items in this release.'}</p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded border border-gray-100 bg-white px-3 py-2">
                <span className="text-[10px] font-medium text-gray-400">
                  {item.type === 'story' ? '\u{1F4D6}' : item.type === 'bug' ? '\u{1F41B}' : '\u{2611}'}
                </span>
                {item.itemNumber && <span className="text-xs text-gray-400">#{item.itemNumber}</span>}
                <span className="text-sm text-gray-700 flex-1">{item.title}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: item.stateColor }}
                >
                  {item.stateName}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Release Notes */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {t('releases.notes') ?? 'Release Notes'}
          </h2>
          {isDraft && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => generateNotes.mutate()}
                disabled={generateNotes.isPending}
              >
                {generateNotes.isPending ? (t('common.generating') ?? 'Generating...') : (t('releases.generateNotes') ?? 'Generate notes')}
              </Button>
              {release.notes && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => enhanceNotes.mutate()}
                  disabled={enhanceNotes.isPending}
                >
                  {enhanceNotes.isPending ? (t('common.generating') ?? 'Generating...') : (t('releases.enhanceWithAI') ?? 'Enhance with AI')}
                </Button>
              )}
            </div>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <Textarea
              rows={15}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveNotes}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : release.notes ? (
          <div
            className="prose prose-sm max-w-none cursor-pointer rounded border border-transparent p-3 hover:border-gray-200"
            onClick={() => {
              if (isDraft) {
                setNotesDraft(release.notes ?? '');
                setEditingNotes(true);
              }
            }}
          >
            <pre className="whitespace-pre-wrap text-sm text-gray-700">{release.notes}</pre>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            {t('releases.noNotes') ?? 'No release notes yet. Click "Generate notes" to create them from the items.'}
          </p>
        )}
      </section>
    </div>
  );
}
