import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface LicenceInfo {
  valid: boolean;
  hasKey: boolean;
  tier: 'community' | 'professional' | 'enterprise';
  organisation: string;
  expiresAt: string | null;
  expired: boolean;
  maxUsers: number;
}

function toLicenceInfo(w: Record<string, unknown>): LicenceInfo {
  return {
    hasKey: w.has_key as boolean,
    valid: w.valid as boolean,
    tier: w.tier as LicenceInfo['tier'],
    organisation: w.organisation as string,
    expiresAt: (w.expires_at as string) ?? null,
    expired: w.expired as boolean,
    maxUsers: (w.max_users as number) ?? 0,
  };
}

export function useLicence() {
  return useQuery({
    queryKey: ['licence'],
    queryFn: async (): Promise<LicenceInfo> => {
      const raw = await api.get<Record<string, unknown>>('/licence');
      return toLicenceInfo(raw);
    },
    staleTime: 5 * 60_000,
  });
}

export function useActivateLicence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string): Promise<LicenceInfo> => {
      const raw = await api.post<Record<string, unknown>>('/licence', { key });
      return toLicenceInfo(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}
