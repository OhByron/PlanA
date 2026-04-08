import { Avatar } from '@projecta/ui';
import { useTranslation } from 'react-i18next';
import type { PresenceEntry } from '../hooks/use-presence';

interface PresenceBarProps {
  viewers: PresenceEntry[];
}

export function PresenceBar({ viewers }: PresenceBarProps) {
  const { t } = useTranslation();
  if (viewers.length === 0) return null;

  const shown = viewers.slice(0, 5);
  const overflow = viewers.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {shown.map((v) => (
          <div key={v.userId} title={v.name || 'Unknown'}>
            <Avatar name={v.name || '?'} size="xs" />
          </div>
        ))}
        {overflow > 0 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600 ring-2 ring-white">
            +{overflow}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-400 ml-1">
        {viewers.length === 1
          ? t('presence.oneViewer')
          : t('presence.multipleViewers', { count: viewers.length })}
      </span>
    </div>
  );
}
