import { useTranslation } from 'react-i18next';

interface AINotConfiguredProps {
  show: boolean;
  onDismiss: () => void;
}

export function AINotConfigured({ show, onDismiss }: AINotConfiguredProps) {
  const { t } = useTranslation();
  if (!show) return null;

  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
      <span>{t('ai.notConfigured') ?? 'AI is not configured for this project. Go to Settings to set up an AI provider.'}</span>
      <button onClick={onDismiss} className="ml-4 font-medium hover:text-amber-900">&times;</button>
    </div>
  );
}
