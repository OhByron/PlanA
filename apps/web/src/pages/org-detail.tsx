import { useState, useMemo } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { Button, Input, Textarea, Select, Badge } from '@projecta/ui';
import { useOrg, useUpdateOrg } from '../hooks/use-orgs-management';
import { useNavigationTree } from '../hooks/use-orgs';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { OrgDetail } from '../lib/api-transforms';

export function OrgDetailPage() {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const { data: org, isLoading } = useOrg(orgId);
  const { data: navTree = [] } = useNavigationTree();

  const orgNode = navTree.find((o) => o.id === orgId);
  const projects = useMemo(
    () => orgNode?.teams.flatMap((t) => t.projects.map((p) => ({ ...p, teamId: t.id, teamName: t.name }))) ?? [],
    [orgNode],
  );
  const teams = orgNode?.teams ?? [];

  const [editing, setEditing] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

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
        All organizations
      </Link>

      {/* Org header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{org.name}</h1>
          {org.archivedAt && <Badge variant="secondary">Archived</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel' : 'Edit Details'}
        </Button>
      </div>

      {editing ? (
        <EditOrgForm org={org} onSave={() => setEditing(false)} />
      ) : (
        <OrgSummary org={org} />
      )}

      {/* Projects section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Projects ({projects.length})
          </h2>
          <Button size="sm" onClick={() => setShowCreateProject(true)} disabled={showCreateProject}>
            + New Project
          </Button>
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
            No projects yet. Create one to get started.
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
                  <Link to="/p/$projectId/settings" params={{ projectId: p.id }}>
                    <Button size="xs" variant="ghost">Settings</Button>
                  </Link>
                  <Link to="/p/$projectId/board" params={{ projectId: p.id }}>
                    <Button size="xs" variant="outline">Open</Button>
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
  const details = [
    org.contactName,
    org.contactEmail,
    org.contactPhone,
    [org.addressLine1, org.city, org.state, org.postalCode, org.country].filter(Boolean).join(', '),
  ].filter(Boolean);

  if (details.length === 0) {
    return <p className="text-sm text-gray-400 italic">No contact details yet. Click "Edit Details" to add them.</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
      {org.contactName && (
        <span><span className="text-gray-400">Contact:</span> {org.contactName}</span>
      )}
      {org.contactEmail && (
        <span><span className="text-gray-400">Email:</span> {org.contactEmail}</span>
      )}
      {org.contactPhone && (
        <span><span className="text-gray-400">Phone:</span> {org.contactPhone}</span>
      )}
      {(org.city || org.state || org.country) && (
        <span>
          <span className="text-gray-400">Location:</span>{' '}
          {[org.city, org.state, org.country].filter(Boolean).join(', ')}
        </span>
      )}
    </div>
  );
}

// --- Edit org form ---
function EditOrgForm({ org, onSave }: { org: OrgDetail; onSave: () => void }) {
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
        <label className="mb-1 block text-xs font-medium text-gray-500">Organization Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Contact Name</label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Contact Email</label>
          <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Contact Phone</label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Address Line 1</label>
          <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Address Line 2</label>
          <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">City</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">State</label>
          <Input value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Postal Code</label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Country</label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} disabled={!name.trim() || update.isPending}>Save</Button>
        <Button variant="ghost" onClick={onSave}>Cancel</Button>
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
      <h3 className="font-medium text-gray-900">New Project</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Project Name *</label>
          <Input
            autoFocus
            placeholder="e.g. PlanA MVP"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Methodology</label>
          <Select value={methodology} onChange={(e) => setMethodology(e.target.value)}>
            <option value="scrum">Scrum</option>
            <option value="kanban">Kanban</option>
            <option value="shape_up">Shape Up</option>
          </Select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
        <Textarea
          placeholder="What is this project about?"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Due Date</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Customer Contact</label>
          <Input placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
          <Input placeholder="email@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
          <Input placeholder="+1 555-0100" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
          Create Project
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
