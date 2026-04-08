import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@projecta/ui';
import { AISettingsPage } from './ai-settings';
import { VCSSettingsPage } from './vcs-settings';

const TABS = ['general', 'repositories'] as const;
type SettingsTab = typeof TABS[number];

/**
 * Unified project settings page with sub-tab navigation.
 * "General" renders the existing AISettingsPage (which includes project details,
 * planning defaults, AI config, workflow subset, sharing, and licence).
 * "Repositories" renders the existing VCSSettingsPage.
 *
 * This avoids duplicating code while providing clear tab separation.
 * As the settings page grows, individual sections can be extracted into
 * their own tab components.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabLabels: Record<SettingsTab, string> = {
    general: t('settings.general') ?? 'General',
    repositories: t('settings.repositories') ?? 'Repositories',
  };

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <nav className="w-44 shrink-0 border-r border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t('nav.settings')}
        </h2>
        <ul className="space-y-1">
          {TABS.map((tab) => (
            <li key={tab}>
              <button
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  activeTab === tab
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                {tabLabels[tab]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && <AISettingsPage />}
        {activeTab === 'repositories' && <VCSSettingsPage />}
      </div>
    </div>
  );
}
