import { Link, useSearch } from '@tanstack/react-router';
import { Button } from '@projecta/ui';

export function AuthErrorPage() {
  const { reason } = useSearch({ strict: false }) as { reason?: string };

  const messages: Record<string, string> = {
    bad_state: 'The login session expired. Please try again.',
    csrf: 'Security check failed. Please try again.',
    exchange_failed: 'Could not complete login with the provider. Please try again.',
    db_error: 'A server error occurred. Please try again later.',
    missing_token: 'No authentication token was received.',
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="max-w-sm space-y-6 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Login failed</h1>
        <p className="text-gray-600">
          {messages[reason ?? ''] ?? 'An unexpected error occurred during login.'}
        </p>
        <Link to="/login">
          <Button className="mt-4">Try again</Button>
        </Link>
      </div>
    </div>
  );
}
