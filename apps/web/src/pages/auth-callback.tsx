import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/auth-context';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const hash = window.location.hash;
    const token = hash
      .substring(1)
      .split('&')
      .find((p) => p.startsWith('token='))
      ?.split('=')[1];

    if (token) {
      login(token).then(() => navigate({ to: '/' }));
    } else {
      navigate({ to: '/auth/error', search: { reason: 'missing_token' } });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
    </div>
  );
}
