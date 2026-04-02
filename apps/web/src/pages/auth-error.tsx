import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@projecta/ui';

export function AuthErrorPage() {
  const { t } = useTranslation();
  const { reason } = useSearch({ strict: false }) as { reason?: string };

  const messages: Record<string, string> = {
    bad_state: t('authError.badState'),
    csrf: t('authError.csrf'),
    exchange_failed: t('authError.exchangeFailed'),
    db_error: t('authError.dbError'),
    missing_token: t('authError.missingToken'),
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="max-w-sm space-y-6 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">{t('authError.title')}</h1>
        <p className="text-gray-600">
          {messages[reason ?? ''] ?? t('authError.default')}
        </p>
        <Link to="/login">
          <Button className="mt-4">{t('common.tryAgain')}</Button>
        </Link>
      </div>
    </div>
  );
}
