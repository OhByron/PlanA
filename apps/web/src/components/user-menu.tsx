import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/auth-context';
import { api } from '../lib/api-client';
import { SUPPORTED_LANGUAGES, loadLanguage, type LanguageCode } from '../i18n';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  const changeLanguage = async (code: LanguageCode) => {
    await loadLanguage(code);
    setLangOpen(false);
    // Persist to server
    try {
      await api.patch('/me/preferences', { language: code });
    } catch {
      // Non-fatal — local change still applies
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-medium text-brand-700 hover:bg-brand-200"
        title={user.name}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>

          {/* Language selector */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <span>{t('common.language')}</span>
              <span className="text-xs text-gray-400">{currentLang.label}</span>
            </button>
            {langOpen && (
              <div className="max-h-64 overflow-y-auto border-t border-gray-100">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-gray-50 ${
                      i18n.language === lang.code ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-700'
                    }`}
                  >
                    <span className="flex-1">{lang.label}</span>
                    {i18n.language === lang.code && (
                      <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('common.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
