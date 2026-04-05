import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cn } from '@projecta/ui';
import { useEstimationVotes, useCastVote, useLockEstimate, useResetVotes } from '../hooks/use-estimation';
import { useAuth } from '../auth/auth-context';
import { useProjectMembers } from '../hooks/use-project-members';

const FIBONACCI = [0, 1, 2, 3, 5, 8, 13, 21];

interface Props {
  workItemId: string;
  projectId: string;
  currentPoints: number | null;
}

export function EstimationVotes({ workItemId, projectId, currentPoints }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: votes = [] } = useEstimationVotes(workItemId);
  const { data: members = [] } = useProjectMembers(projectId);
  const castVote = useCastVote(workItemId);
  const lockEstimate = useLockEstimate(workItemId, projectId);
  const resetVotes = useResetVotes(workItemId);

  const currentMember = members.find((m) => m.userId === user?.id);
  const isPM = currentMember?.jobRole === 'pm' || currentMember?.jobRole === 'po';
  const myVote = votes.find((v) => v.memberId === currentMember?.id);

  // Vote distribution
  const distribution = useMemo(() => {
    const counts = new Map<number, number>();
    for (const v of votes) {
      counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
    }
    return counts;
  }, [votes]);

  // Consensus check
  const allSame = votes.length > 1 && new Set(votes.map((v) => v.value)).size === 1;
  const avg = votes.length > 0 ? Math.round(votes.reduce((s, v) => s + v.value, 0) / votes.length) : null;
  // Snap average to nearest Fibonacci
  const suggestedValue = avg != null ? FIBONACCI.reduce((prev, curr) =>
    Math.abs(curr - avg) < Math.abs(prev - avg) ? curr : prev, FIBONACCI[0]!) : null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {t('estimation.title')}
        </h2>
        {votes.length > 0 && (
          <button onClick={() => resetVotes.mutate()} className="text-xs text-gray-400 hover:text-gray-600">
            {t('estimation.reset')}
          </button>
        )}
      </div>

      {/* Card picker */}
      <div className="flex gap-1.5 mb-3">
        {FIBONACCI.map((value) => (
          <button
            key={value}
            onClick={() => castVote.mutate(value)}
            className={cn(
              'w-10 h-14 rounded-lg border-2 text-sm font-bold transition-all hover:scale-105',
              myVote?.value === value
                ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {/* Votes cast */}
      {votes.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {votes.map((v) => (
              <div key={v.id} className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                <span className="text-xs text-gray-600">{v.memberName}</span>
                <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {v.value}
                </span>
              </div>
            ))}
          </div>

          {/* Distribution bar */}
          <div className="flex items-center gap-1 mb-2">
            {FIBONACCI.filter((v) => distribution.has(v)).map((value) => {
              const count = distribution.get(value)!;
              const pct = (count / votes.length) * 100;
              return (
                <div key={value} className="flex flex-col items-center">
                  <div
                    className="w-6 rounded-sm bg-brand-400"
                    style={{ height: `${Math.max(4, pct * 0.4)}px` }}
                  />
                  <span className="text-[9px] text-gray-500 mt-0.5">{value}</span>
                  <span className="text-[8px] text-gray-400">{count}x</span>
                </div>
              );
            })}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{t('estimation.votes', { count: votes.length })}</span>
            {avg != null && <span>{t('estimation.average', { value: avg })}</span>}
            {allSame && <span className="font-medium text-emerald-600">{t('estimation.consensus')}</span>}
          </div>

          {/* Lock button (PM only) */}
          {isPM && votes.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => lockEstimate.mutate(allSame ? votes[0]!.value : suggestedValue!)}
                disabled={lockEstimate.isPending}
              >
                {t('estimation.lock', { value: allSame ? votes[0]!.value : suggestedValue })}
              </Button>
              {!allSame && suggestedValue != null && (
                <span className="text-xs text-gray-400">{t('estimation.nearestFib')}</span>
              )}
            </div>
          )}
        </div>
      )}

      {votes.length === 0 && currentPoints != null && (
        <p className="text-xs text-gray-400">{t('estimation.currentEstimate', { points: currentPoints })}</p>
      )}
    </section>
  );
}
