import { cn } from '@projecta/ui';

interface VCSStatusBadgeProps {
  state: 'open' | 'closed' | 'merged';
  checksStatus?: string | null;
  checksUrl?: string | null;
  draft?: boolean;
  className?: string;
}

export function VCSStatusBadge({ state, checksStatus, checksUrl, draft, className }: VCSStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
        state === 'open' && !draft && 'bg-green-50 text-green-700',
        state === 'open' && draft && 'bg-gray-100 text-gray-500',
        state === 'merged' && 'bg-purple-50 text-purple-700',
        state === 'closed' && 'bg-red-50 text-red-600',
        className,
      )}
    >
      <PRStateIcon state={state} draft={draft ?? false} />
      {draft ? 'Draft' : state === 'open' ? 'Open' : state === 'merged' ? 'Merged' : 'Closed'}
      {checksStatus && state === 'open' && <ChecksIndicator status={checksStatus} url={checksUrl} />}
    </span>
  );
}

function PRStateIcon({ state, draft }: { state: string; draft?: boolean }) {
  if (draft) {
    return <span className="text-gray-400">&#9675;</span>;
  }
  if (state === 'merged') {
    return <span className="text-purple-600">&#10003;</span>;
  }
  if (state === 'closed') {
    return <span className="text-red-500">&#10005;</span>;
  }
  return <span className="text-green-600">&#9679;</span>;
}

function ChecksIndicator({ status, url }: { status: string; url?: string | null | undefined }) {
  let icon: string;
  let color: string;
  let title: string;

  if (status === 'success') {
    icon = '\u2713'; color = 'text-green-600'; title = 'Checks passing';
  } else if (status === 'failure') {
    icon = '\u2717'; color = 'text-red-500'; title = 'Checks failing';
  } else if (status === 'pending') {
    icon = '\u25CF'; color = 'text-amber-500'; title = 'Checks pending';
  } else {
    return null;
  }

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={`${color} hover:underline`} title={title}>
        {icon}
      </a>
    );
  }
  return <span className={color} title={title}>{icon}</span>;
}

// Compact badge for board cards - shows just the PR count and overall status
interface VCSCardBadgeProps {
  openPrCount: number;
  mergedPrs: number;
  checksStatus?: string | null;
}

export function VCSCardBadge({ openPrCount, mergedPrs, checksStatus }: VCSCardBadgeProps) {
  if (openPrCount === 0 && mergedPrs === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
        checksStatus === 'failure' && 'bg-red-50 text-red-600',
        checksStatus === 'success' && 'bg-green-50 text-green-700',
        checksStatus === 'pending' && 'bg-amber-50 text-amber-600',
        !checksStatus && 'bg-gray-100 text-gray-500',
      )}
      title={`${openPrCount} open, ${mergedPrs} merged`}
    >
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
      </svg>
      {openPrCount > 0 && <span>{openPrCount}</span>}
      {mergedPrs > 0 && <span className="text-purple-600">{mergedPrs}</span>}
    </span>
  );
}
