import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@projecta/ui';
import type { WorkItem } from '@projecta/types';

export interface CommandItem {
  id: string;
  label: string;
  description?: string | undefined;
  icon?: string | undefined;
  category: 'item' | 'navigate' | 'action';
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items by query
  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 20);
    const q = query.toLowerCase();
    return items
      .filter((item) =>
        item.label.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 20);
  }, [items, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: string; items: CommandItem[] }[] = [];
    const categoryOrder = ['item', 'navigate', 'action'];
    const categoryLabels: Record<string, string> = {
      item: t('commandPalette.workItems') ?? 'Work Items',
      navigate: t('commandPalette.navigation') ?? 'Navigation',
      action: t('commandPalette.actions') ?? 'Actions',
    };

    for (const cat of categoryOrder) {
      const catItems = filtered.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        groups.push({ category: categoryLabels[cat] ?? cat, items: catItems });
      }
    }
    return groups;
  }, [filtered, t]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            flatItems[selectedIndex].onSelect();
            onClose();
          }
          break;
        case 'Escape':
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, onClose],
  );

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder') ?? 'Search or type a command...'}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {flatItems.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">
              {t('commandPalette.noResults') ?? 'No results found.'}
            </p>
          )}

          {grouped.map((group) => (
            <div key={group.category} className="mb-2">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {group.category}
              </p>
              {group.items.map((item) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={item.id}
                    data-index={idx}
                    onClick={() => {
                      item.onSelect();
                      onClose();
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      idx === selectedIndex
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {item.icon && <span className="text-base shrink-0">{item.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{item.label}</span>
                      {item.description && (
                        <span className="ml-2 text-xs text-gray-400 truncate">{item.description}</span>
                      )}
                    </div>
                    {item.category === 'navigate' && (
                      <span className="text-xs text-gray-300">&rarr;</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400 flex gap-4">
          <span><kbd className="font-mono">&uarr;&darr;</kbd> {t('commandPalette.navigate') ?? 'navigate'}</span>
          <span><kbd className="font-mono">&crarr;</kbd> {t('commandPalette.select') ?? 'select'}</span>
          <span><kbd className="font-mono">esc</kbd> {t('commandPalette.close') ?? 'close'}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to build command palette items from app data.
 */
export function useCommandItems(
  projectId: string | null,
  workItems: (WorkItem & { itemNumber?: number | null })[],
): CommandItem[] {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return useMemo(() => {
    const items: CommandItem[] = [];

    // Work items (search by title and item number)
    if (projectId) {
      for (const wi of workItems.slice(0, 100)) {
        const num = (wi as { itemNumber?: number }).itemNumber;
        items.push({
          id: `wi-${wi.id}`,
          label: `${num ? `#${num} ` : ''}${wi.title}`,
          description: wi.type,
          icon: wi.type === 'story' ? '\u{1F4D6}' : wi.type === 'bug' ? '\u{1F41B}' : '\u{2611}',
          category: 'item',
          onSelect: () => navigate({
            to: '/p/$projectId/items/$workItemId',
            params: { projectId: projectId!, workItemId: wi.id },
          }),
        });
      }

      // Navigation
      const navItems = [
        { path: '/p/$projectId/board', label: t('nav.board'), icon: '\u{1F4CB}' },
        { path: '/p/$projectId/backlog', label: t('nav.backlog'), icon: '\u{1F4E5}' },
        { path: '/p/$projectId/graph', label: t('nav.graph'), icon: '\u{1F578}' },
        { path: '/p/$projectId/sprints', label: t('nav.sprints'), icon: '\u{1F3C3}' },
        { path: '/p/$projectId/epics', label: t('nav.epics'), icon: '\u{1F3AF}' },
        { path: '/p/$projectId/reports', label: t('nav.reports'), icon: '\u{1F4CA}' },
        { path: '/p/$projectId/settings', label: t('nav.settings'), icon: '\u{2699}' },
      ];

      for (const nav of navItems) {
        items.push({
          id: `nav-${nav.path}`,
          label: nav.label,
          icon: nav.icon,
          category: 'navigate',
          onSelect: () => navigate({
            to: nav.path as '/p/$projectId/board',
            params: { projectId: projectId! },
          }),
        });
      }
    }

    return items;
  }, [projectId, workItems, navigate, t]);
}
