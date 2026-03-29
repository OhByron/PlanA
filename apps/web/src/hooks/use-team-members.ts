import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { toTeamMember, type TeamMember, type TeamMemberWire } from '../lib/api-transforms';

export function useTeamMembers(orgId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-members', orgId, teamId],
    queryFn: async (): Promise<TeamMember[]> => {
      const raw = await api.get<TeamMemberWire[]>(
        `/orgs/${orgId}/teams/${teamId}/members`,
      );
      return raw.map(toTeamMember);
    },
    enabled: !!orgId && !!teamId,
    staleTime: 5 * 60_000,
  });
}
