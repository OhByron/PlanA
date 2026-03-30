import { useQuery } from '@tanstack/react-query';
import type { Organization, Team, Project } from '@projecta/types';
import { api } from '../lib/api-client';
import { toOrg, toTeam, toProject } from '../lib/api-transforms';
import type { PaginatedResponse } from '../lib/api-pagination';

export interface NavOrg extends Organization {
  teams: NavTeam[];
}

export interface NavTeam extends Team {
  projects: Project[];
}

/**
 * Fetches the full org → team → project tree in a single query.
 * Suitable for Phase 1 data volumes; can be optimized later.
 */
export function useNavigationTree() {
  return useQuery({
    queryKey: ['nav-tree'],
    queryFn: async (): Promise<NavOrg[]> => {
      // 1. Fetch orgs
      const rawOrgs = await api.get<unknown>('/orgs?page_size=200');
      const orgsArr = Array.isArray(rawOrgs) ? rawOrgs : (rawOrgs as PaginatedResponse).items ?? [];
      const orgs = orgsArr.map(toOrg);

      // 2. Fetch teams for each org in parallel
      const orgsWithTeams = await Promise.all(
        orgs.map(async (org) => {
          const rawTeams = await api.get<unknown>(`/orgs/${org.id}/teams?page_size=200`);
          const teamsArr = Array.isArray(rawTeams) ? rawTeams : (rawTeams as PaginatedResponse).items;
          const teams = teamsArr.map(toTeam);

          // 3. Fetch projects for each team in parallel
          const teamsWithProjects = await Promise.all(
            teams.map(async (team) => {
              const rawProjects = await api.get<unknown>(
                `/orgs/${org.id}/teams/${team.id}/projects?page_size=200`,
              );
              const projArr = Array.isArray(rawProjects) ? rawProjects : (rawProjects as PaginatedResponse).items ?? [];
              return { ...team, projects: projArr.map(toProject) };
            }),
          );

          return { ...org, teams: teamsWithProjects };
        }),
      );

      return orgsWithTeams;
    },
    staleTime: 5 * 60_000,
  });
}
