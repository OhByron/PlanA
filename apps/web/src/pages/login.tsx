import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@projecta/ui';
import { api } from '../lib/api-client';
import { useAuth } from '../auth/auth-context';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [loginError, setLoginError] = useState('');

  const startOAuth = async (provider: 'github' | 'google') => {
    const data = await api.post<{ url: string }>(`/auth/${provider}`);
    window.location.href = data.url;
  };

  const emailLogin = async () => {
    setLoginError('');
    try {
      const data = await api.post<{ token: string }>('/auth/login', {
        email,
        password: passwordVal,
      });
      await login(data.token);
      navigate({ to: '/' });
    } catch (err: any) {
      setLoginError(err.message ?? 'Login failed');
    }
  };

  const devLogin = async () => {
    const data = await api.post<{ token: string }>('/auth/dev-login', {
      email: 'test@plana.dev',
      name: 'Test User',
    });
    await login(data.token);
    navigate({ to: '/' });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-8 px-4">
        {/* Branding */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Plan<span className="text-brand-600">A</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">{t('brand.tagline')}</p>
        </div>

        {/* Login buttons */}
        <div className="space-y-3">
          <Button
            className="w-full justify-center"
            onClick={() => startOAuth('github')}
          >
            <svg className="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            {t('login.continueWithGitHub')}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={() => startOAuth('google')}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t('login.continueWithGoogle')}
          </Button>

          {/* Email/Password login */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-gray-50 px-2 text-gray-400">{t('login.orSignInWithEmail')}</span>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); emailLogin(); }} className="space-y-2">
            <Input
              type="email"
              placeholder={t('login.emailAddress')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder={t('login.password')}
              value={passwordVal}
              onChange={(e) => setPasswordVal(e.target.value)}
            />
            {loginError && <p className="text-xs text-red-600">{loginError}</p>}
            <Button className="w-full justify-center" type="submit" disabled={!email || !passwordVal}>
              {t('common.signIn')}
            </Button>
          </form>

          {/* Dev login -- development only */}
          {import.meta.env.DEV && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-gray-50 px-2 text-gray-400">{t('login.devOnly')}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-center text-gray-500"
                onClick={devLogin}
              >
                {t('login.devLogin')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
