import { useState, useEffect } from 'react';
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

  // Licence state
  const [licenceChecked, setLicenceChecked] = useState(false);
  const [hasLicence, setHasLicence] = useState(false);
  const [licenceTier, setLicenceTier] = useState('');
  const [licenceOrg, setLicenceOrg] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [activating, setActivating] = useState(false);

  // Check licence on mount
  useEffect(() => {
    api.get<any>('/licence').then((data) => {
      if (data.has_key) {
        // Any tier (including community) with a non-empty key means licenced
        setHasLicence(true);
        setLicenceTier(data.tier);
        setLicenceOrg(data.organisation);
      }
      setLicenceChecked(true);
    }).catch(() => {
      // API not reachable — allow login anyway
      setHasLicence(true);
      setLicenceChecked(true);
    });
  }, []);

  const activateKey = async () => {
    if (!keyInput.trim()) return;
    setActivating(true);
    setKeyError('');
    try {
      // Licence activation is on the authenticated endpoint, but we need
      // a special public activation for first-time setup. Let's try posting
      // directly — if auth is required, we'll handle it.
      const data = await fetch('/api/licence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim() }),
      }).then((r) => r.json());

      if (data.valid) {
        setHasLicence(true);
        setLicenceTier(data.tier);
        setLicenceOrg(data.organisation);
      } else {
        setKeyError(t('login.invalidKey'));
      }
    } catch {
      setKeyError(t('login.invalidKey'));
    } finally {
      setActivating(false);
    }
  };

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

  if (!licenceChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

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

        {!hasLicence ? (
          /* Licence key entry — shown before login */
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-center text-sm font-semibold text-gray-700">
                {t('login.licenceRequired')}
              </h2>
              <p className="mt-2 text-center text-xs text-gray-400">
                {t('login.licenceExplainer')}
              </p>

              <div className="mt-4 space-y-2">
                <textarea
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={t('login.keyPlaceholder')}
                  rows={3}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                {keyError && <p className="text-xs text-red-500">{keyError}</p>}
                <Button
                  className="w-full justify-center"
                  onClick={activateKey}
                  disabled={!keyInput.trim() || activating}
                >
                  {activating ? t('login.activating') : t('login.activateKey')}
                </Button>
              </div>

              <div className="mt-4 text-center">
                <a
                  href="https://plana.dev/request-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:text-brand-800"
                >
                  {t('login.getFreeKey')}
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* Login form — shown after licence is active */
          <>
            {/* Licence badge */}
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-brand-50 px-3 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                {licenceTier}
              </span>
              <span className="text-xs text-gray-400">{licenceOrg}</span>
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

              {/* Email/Password */}
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

              {/* Dev login */}
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
          </>
        )}
      </div>
    </div>
  );
}
