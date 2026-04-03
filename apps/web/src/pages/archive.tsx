import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@projecta/ui';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface ArchivedOrg {
  id: string;
  name: string;
  archivedAt: string;
}

interface ArchivedProject {
  id: string;
  name: string;
  methodology: string;
  teamName: string;
  orgName: string;
  archivedAt: string;
}

interface RawOrg {
  id: string;
  name: string;
  archived_at: string | null;
}

interface RawTeam {
  id: string;
  name: string;
}

interface RawProject {
  id: string;
  name: string;
  methodology: string;
  archived_at: string | null;
}

interface PaginatedResponse {
  items: unknown[];
}

function toArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  return (raw as PaginatedResponse)?.items ?? [];
}

export function ArchivePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [archivedOrgs, setArchivedOrgs] = useState<ArchivedOrg[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all orgs including archived
      const rawOrgs = toArray(await api.get('/orgs?include_archived=true')) as RawOrg[];

      const archived: ArchivedOrg[] = rawOrgs
        .filter((o) => o.archived_at)
        .map((o) => ({ id: o.id, name: o.name, archivedAt: o.archived_at! }));
      setArchivedOrgs(archived);

      // For each org (including archived), fetch teams then projects
      const allArchivedProjects: ArchivedProject[] = [];
      for (const org of rawOrgs) {
        const rawTeams = toArray(await api.get(`/orgs/${org.id}/teams?page_size=200`)) as RawTeam[];
        for (const team of rawTeams) {
          const rawProjects = toArray(
            await api.get(`/orgs/${org.id}/teams/${team.id}/projects?page_size=200&include_archived=true`),
          ) as RawProject[];
          for (const p of rawProjects) {
            if (p.archived_at) {
              allArchivedProjects.push({
                id: p.id,
                name: p.name,
                methodology: p.methodology,
                teamName: team.name,
                orgName: org.name,
                archivedAt: p.archived_at,
              });
            }
          }
        }
      }
      setArchivedProjects(allArchivedProjects);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const unarchiveOrg = async (orgId: string) => {
    await api.post(`/orgs/${orgId}/unarchive`, {});
    qc.invalidateQueries({ queryKey: ['nav-tree'] });
    fetchArchived();
  };

  const unarchiveProject = async (projectId: string) => {
    await api.post(`/projects/${projectId}/unarchive`, {});
    qc.invalidateQueries({ queryKey: ['nav-tree'] });
    fetchArchived();
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const hasArchived = archivedOrgs.length > 0 || archivedProjects.length > 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">{t('archive.title')}</h1>
      <p className="text-sm text-gray-500 mb-6">{t('archive.description')}</p>

      {!hasArchived && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">{t('archive.nothingArchived')}</p>
        </div>
      )}

      {archivedOrgs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('archive.organisations', { count: archivedOrgs.length })}
          </h2>
          <div className="space-y-2">
            {archivedOrgs.map((org) => (
              <div key={org.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-400">
                    {t('archive.archivedOn', { date: new Date(org.archivedAt).toLocaleDateString() })}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => unarchiveOrg(org.id)}>
                  {t('archive.restore')}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {archivedProjects.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('archive.projects', { count: archivedProjects.length })}
          </h2>
          <div className="space-y-2">
            {archivedProjects.map((project) => (
              <div key={project.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{project.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{project.orgName}</span>
                    <span className="text-gray-300">/</span>
                    <span className="text-xs text-gray-400">{project.teamName}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{project.methodology}</span>
                    <span className="text-xs text-gray-400">
                      {t('archive.archivedOn', { date: new Date(project.archivedAt).toLocaleDateString() })}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => unarchiveProject(project.id)}>
                  {t('archive.restore')}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
