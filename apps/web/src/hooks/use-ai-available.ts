import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

/**
 * Check if AI is configured for a project.
 * Returns { available, provider } so components can show
 * a helpful message when the user clicks an AI button without config.
 */
export function useAIAvailable(projectId: string) {
  const { data } = useQuery({
    queryKey: ['ai-settings', projectId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>>(`/projects/${projectId}/ai-settings`);
      return {
        available: !!(raw.provider && raw.provider !== ''),
        provider: (raw.provider as string) ?? '',
      };
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

  const [showNotConfigured, setShowNotConfigured] = useState(false);

  const guardAI = useCallback(
    (action: () => void) => {
      if (data?.available) {
        action();
      } else {
        setShowNotConfigured(true);
        setTimeout(() => setShowNotConfigured(false), 4000);
      }
    },
    [data?.available],
  );

  return {
    aiAvailable: data?.available ?? false,
    aiProvider: data?.provider ?? '',
    guardAI,
    showNotConfigured,
    dismissNotConfigured: () => setShowNotConfigured(false),
  };
}
