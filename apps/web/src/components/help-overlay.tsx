import { useState, useEffect } from 'react';
import { Button } from '@projecta/ui';
import { isDismissed, dismiss } from '../lib/help-store';

interface HelpOverlayProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function HelpOverlay({ id, title, children }: HelpOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDismissed(id)) return;
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [id]);

  if (!visible) return null;

  const handleDismiss = () => {
    dismiss(id);
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
      <div className="relative mx-4 max-w-md animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-brand-200 bg-white p-6 shadow-xl">
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="mb-2 text-base font-semibold text-gray-900">{title}</h3>
        <div className="mb-4 text-sm text-gray-600 leading-relaxed">{children}</div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleDismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
