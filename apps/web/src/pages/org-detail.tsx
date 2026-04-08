import { useState, useMemo } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { Button, Input, Textarea, Select, Badge } from '@projecta/ui';
import { useOrg, useUpdateOrg } from '../hooks/use-orgs-management';
import { useNavigationTree } from '../hooks/use-orgs';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { OrgDetail } from '../lib/api-transforms';
import { useTranslation } from 'react-i18next';

export function OrgDetailPage() {
  const { t } = useTranslation();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const { data: org, isLoading } = useOrg(orgId);
  const { data: navTree = [] } = useNavigationTree();
  const qc = useQueryClient();

  const orgNode = navTree.find((o) => o.id === orgId);
  const projects = useMemo(
    () => orgNode?.teams.flatMap((t) => t.projects.map((p) => ({ ...p, teamId: t.id, teamName: t.name }))) ?? [],
    [orgNode],
  );
  const teams = orgNode?.teams ?? [];

  const [editing, setEditing] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showArchiveWarning, setShowArchiveWarning] = useState(false);

  if (isLoading || !org) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/orgs" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('orgDetail.allOrganisations')}
      </Link>

      {/* Org header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{org.name}</h1>
          {org.archivedAt && <Badge variant="secondary">{t('orgs.archived')}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {org.archivedAt ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await api.post(`/orgs/${orgId}/unarchive`, {});
                qc.invalidateQueries({ queryKey: ['org', orgId] });
                qc.invalidateQueries({ queryKey: ['nav-tree'] });
              }}
            >
              {t('orgDetail.unarchive')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowArchiveWarning(true)}
            >
              {t('orgDetail.archive')}
            </Button>
          )}
          <Link
            to="/orgs/$orgId/workflow"
            params={{ orgId }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('workflow.title') ?? 'Workflow'}
          </Link>
          <Link
            to="/orgs/$orgId/portfolio"
            params={{ orgId }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('portfolio.title') ?? 'Portfolio'}
          </Link>
          <Link
            to="/orgs/$orgId/hooks"
            params={{ orgId }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('workflow.hooksTitle') ?? 'Hooks'}
          </Link>
          <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? t('common.cancel') : t('orgDetail.editDetails')}
          </Button>
        </div>
      </div>

      {/* Archive warning modal */}
      {showArchiveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('orgDetail.archiveWarningTitle')}</h3>
            <p className="text-sm text-gray-600 mb-3">
              {t('orgDetail.archiveWarningBody', { projectCount: projects.length, teamCount: teams.length })}
            </p>
            {projects.length > 0 && (
              <div className="mb-4 max-h-32 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
                <p className="text-xs font-medium text-gray-500 mb-1">{t('orgDetail.affectedProjects')}</p>
                {projects.map((p) => (
                  <p key={p.id} className="text-xs text-gray-700">- {p.name}</p>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mb-4">{t('orgDetail.archiveReversible')}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowArchiveWarning(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await api.post(`/orgs/${orgId}/archive`, {});
                  qc.invalidateQueries({ queryKey: ['org', orgId] });
                  qc.invalidateQueries({ queryKey: ['nav-tree'] });
                  setShowArchiveWarning(false);
                }}
              >
                {t('orgDetail.confirmArchive')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        <EditOrgForm org={org} onSave={() => setEditing(false)} />
      ) : (
        <OrgSummary org={org} />
      )}

      {/* Projects section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {t('orgDetail.projects', { count: projects.length })}
          </h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCreateProject(true)} disabled={showCreateProject}>
              {t('orgDetail.newProject')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const teamId = teams[0]?.id;
                    if (!teamId) { alert('No team found to import into'); return; }
                    const asTemplate = window.confirm('Import as template? (OK = template with reset statuses, Cancel = full import)');
                    await api.post(`/orgs/${orgId}/teams/${teamId}/projects/import`, {
                      team_id: teamId,
                      as_template: asTemplate,
                      data,
                    });
                    qc.invalidateQueries({ queryKey: ['nav-tree'] });
                    window.location.reload();
                  } catch (err) {
                    alert('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                  }
                };
                input.click();
              }}
            >
              {t('orgDetail.importProject')}
            </Button>
          </div>
        </div>

        {showCreateProject && (
          <CreateProjectForm
            orgId={orgId}
            teams={teams}
            onClose={() => setShowCreateProject(false)}
          />
        )}

        {projects.length === 0 && !showCreateProject && (
          <p className="py-8 text-center text-gray-400">
            {t('orgDetail.noProjectsYet')}
          </p>
        )}

        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    to="/p/$projectId/board"
                    params={{ projectId: p.id }}
                    className="text-sm font-medium text-gray-900 hover:text-brand-700"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {p.methodology}
                    </span>
                    {p.description && (
                      <span className="text-xs text-gray-400 truncate max-w-md">
                        {p.description}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/p/$projectId/report" params={{ projectId: p.id }}>
                    <Button size="xs" variant="ghost">{t('common.report')}</Button>
                  </Link>
                  <Link to="/p/$projectId/settings" params={{ projectId: p.id }}>
                    <Button size="xs" variant="ghost">{t('common.settings')}</Button>
                  </Link>
                  <Link to="/p/$projectId/board" params={{ projectId: p.id }}>
                    <Button size="xs" variant="outline">{t('common.open')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Compact org summary (read-only) ---
function OrgSummary({ org }: { org: OrgDetail }) {
  const { t } = useTranslation();
  const details = [
    org.contactName,
    org.contactEmail,
    org.contactPhone,
    [org.addressLine1, org.city, org.state, org.postalCode, org.country].filter(Boolean).join(', '),
  ].filter(Boolean);

  if (details.length === 0) {
    return <p className="text-sm text-gray-400 italic">{t('orgDetail.noContactDetails')}</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
      {org.contactName && (
        <span><span className="text-gray-400">{t('orgDetail.contact')}</span> {org.contactName}</span>
      )}
      {org.contactEmail && (
        <span><span className="text-gray-400">{t('orgDetail.email')}</span> {org.contactEmail}</span>
      )}
      {org.contactPhone && (
        <span><span className="text-gray-400">{t('orgDetail.phone')}</span> {org.contactPhone}</span>
      )}
      {(org.city || org.state || org.country) && (
        <span>
          <span className="text-gray-400">{t('orgDetail.location')}</span>{' '}
          {[org.city, org.state, org.country].filter(Boolean).join(', ')}
        </span>
      )}
    </div>
  );
}

// --- Edit org form ---
function EditOrgForm({ org, onSave }: { org: OrgDetail; onSave: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateOrg();
  const [name, setName] = useState(org.name);
  const [contactName, setContactName] = useState(org.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(org.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(org.contactPhone ?? '');
  const [addressLine1, setAddressLine1] = useState(org.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(org.addressLine2 ?? '');
  const [city, setCity] = useState(org.city ?? '');
  const [state, setState] = useState(org.state ?? '');
  const [postalCode, setPostalCode] = useState(org.postalCode ?? '');
  const [country, setCountry] = useState(org.country ?? '');

  const submit = () => {
    const data: Record<string, unknown> = {};
    if (name !== org.name) data.name = name;
    if (contactName !== (org.contactName ?? '')) data.contact_name = contactName || null;
    if (contactEmail !== (org.contactEmail ?? '')) data.contact_email = contactEmail || null;
    if (contactPhone !== (org.contactPhone ?? '')) data.contact_phone = contactPhone || null;
    if (addressLine1 !== (org.addressLine1 ?? '')) data.address_line1 = addressLine1 || null;
    if (addressLine2 !== (org.addressLine2 ?? '')) data.address_line2 = addressLine2 || null;
    if (city !== (org.city ?? '')) data.city = city || null;
    if (state !== (org.state ?? '')) data.state = state || null;
    if (postalCode !== (org.postalCode ?? '')) data.postal_code = postalCode || null;
    if (country !== (org.country ?? '')) data.country = country || null;
    if (Object.keys(data).length === 0) { onSave(); return; }
    update.mutate({ orgId: org.id, data }, { onSuccess: onSave });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.orgName')}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.contactName')}</label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.contactEmail')}</label>
          <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.contactPhone')}</label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.addressLine1')}</label>
          <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.addressLine2')}</label>
          <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.city')}</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.state')}</label>
          <Input value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.postalCode')}</label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.country')}</label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} disabled={!name.trim() || update.isPending}>{t('common.save')}</Button>
        <Button variant="ghost" onClick={onSave}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

// --- Create project form ---
// Auto-creates a "Default" team if the org has none (teams are invisible infrastructure).
function CreateProjectForm({
  orgId,
  teams,
  onClose,
}: {
  orgId: string;
  teams: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [methodology, setMethodology] = useState('scrum');
  const [dueDate, setDueDate] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      // Ensure a team exists — auto-create if needed
      let teamId: string;
      if (teams.length > 0) {
        teamId = teams[0]!.id;
      } else {
        const teamRes = await api.post<{ id: string }>(`/orgs/${orgId}/teams`, { name: 'Default' });
        teamId = teamRes.id;
      }

      const body: Record<string, unknown> = { name: name.trim(), methodology };
      if (description.trim()) body.description = description.trim();
      if (dueDate) body.due_date = dueDate;
      if (contactName.trim()) body.contact_name = contactName.trim();
      if (contactEmail.trim()) body.contact_email = contactEmail.trim();
      if (contactPhone.trim()) body.contact_phone = contactPhone.trim();
      await api.post(`/orgs/${orgId}/teams/${teamId}/projects`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
      onClose();
    },
  });

  return (
    <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50/30 p-4 space-y-3">
      <h3 className="font-medium text-gray-900">{t('orgDetail.newProjectTitle')}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.projectNameRequired')}</label>
          <Input
            autoFocus
            placeholder={t('createProject.projectNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.methodology')}</label>
          <Select value={methodology} onChange={(e) => setMethodology(e.target.value)}>
            <option value="scrum">{t('methodology.scrum')}</option>
            <option value="kanban">{t('methodology.kanban')}</option>
            <option value="shape_up">{t('methodology.shape_up')}</option>
          </Select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.description')}</label>
        <Textarea
          placeholder={t('orgDetail.whatIsThisProjectAbout')}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.dueDate')}</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.customerContact')}</label>
          <Input placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.email')}</label>
          <Input placeholder="email@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgDetail.phone')}</label>
          <Input placeholder="+1 555-0100" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
          {t('orgDetail.createProject')}
        </Button>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}
