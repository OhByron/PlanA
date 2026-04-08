import { useTranslation } from 'react-i18next';

interface StatusBadgeProps {
  stateName: string;
  stateSlug: string;
  stateColor: string;
  isCancelled?: boolean | undefined;
}

export function StatusBadge({ stateName, stateSlug, stateColor, isCancelled }: StatusBadgeProps) {
  const { t } = useTranslation();

  if (isCancelled) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 line-through">
        {t('status.cancelled', { defaultValue: 'Cancelled' })}
      </span>
    );
  }

  const displayName = t(`status.${stateSlug}`, { defaultValue: stateName });

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: stateColor }}
    >
      {displayName}
    </span>
  );
}
