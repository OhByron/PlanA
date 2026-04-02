import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@projecta/ui';
import type { Comment } from '@projecta/types';
import type { UseMutationResult } from '@tanstack/react-query';
import { RichTextEditor } from './rich-text-editor';
import { RichTextDisplay } from './rich-text-display';
import type { ProjectMember } from '../hooks/use-project-members';

export interface CommentsSectionProps {
  comments: Comment[];
  createComment: UseMutationResult<Comment, Error, Record<string, unknown>>;
  projectMembers: ProjectMember[];
}

export function CommentsSection({
  comments,
  createComment,
  projectMembers,
}: CommentsSectionProps) {
  const { t } = useTranslation();
  const [commentDraft, setCommentDraft] = useState('');
  const [commentKey, setCommentKey] = useState(0);

  const submitComment = () => {
    if (commentDraft) {
      createComment.mutate(JSON.parse(commentDraft));
      setCommentDraft('');
      setCommentKey((k) => k + 1);
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {t('comments.title')}
      </h2>

      {comments.length === 0 && (
        <p className="mb-3 text-sm text-gray-400">{t('comments.noCommentsYet')}</p>
      )}

      {comments.map((c) => {
        const member = projectMembers.find((m) => m.id === c.userId) ??
          projectMembers.find((m) => m.userId === c.userId);
        return (
          <div key={c.id} className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">
                {member?.name ?? c.userId.slice(0, 8)}
              </span>
              <span>·</span>
              <span>{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
            <RichTextDisplay content={c.body as Record<string, unknown>} />
          </div>
        );
      })}

      <div className="space-y-2">
        <RichTextEditor
          key={commentKey}
          placeholder={t('comments.addComment')}
          onChange={(json) => setCommentDraft(JSON.stringify(json))}
        />
        <Button
          size="sm"
          onClick={submitComment}
          disabled={!commentDraft}
        >
          {t('common.send')}
        </Button>
      </div>
    </section>
  );
}
