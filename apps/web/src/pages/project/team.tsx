import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Input, Select, Badge, Avatar } from '@projecta/ui';
import { api } from '../../lib/api-client';
import {
  useProjectMembers,
  useCreateProjectMember,
  useUpdateProjectMember,
  useDeleteProjectMember,
  type ProjectMember,
} from '../../hooks/use-project-members';

const JOB_ROLES = [
  { value: 'pm', label: 'PM' },
  { value: 'po', label: 'PO' },
  { value: 'bsa', label: 'BSA' },
  { value: 'ba', label: 'BA' },
  { value: 'qe', label: 'QE' },
  { value: 'ux', label: 'UX' },
  { value: 'dev', label: 'DEV' },
];

const roleColors: Record<string, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  pm: 'warning',
  po: 'warning',
  bsa: 'default',
  ba: 'default',
  qe: 'success',
  ux: 'secondary',
  dev: 'secondary',
};

export function TeamPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: members = [], isLoading } = useProjectMembers(projectId);
  const createMember = useCreateProjectMember(projectId);
  const updateMember = useUpdateProjectMember(projectId);
  const deleteMember = useDeleteProjectMember(projectId);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});

  const handleInvite = async (memberId: string) => {
    try {
      const data = await api.post<{ invite_url: string }>(
        `/projects/${projectId}/members/${memberId}/invite`,
      );
      setInviteUrls((prev) => ({ ...prev, [memberId]: data.invite_url }));
    } catch (err: any) {
      alert(err.message ?? 'Failed to create invitation');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Team</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} disabled={showAdd}>
          + Add Member
        </Button>
      </div>

      {/* Add member form */}
      {showAdd && (
        <AddMemberForm
          onSubmit={(data) => {
            createMember.mutate(data, { onSuccess: () => setShowAdd(false) });
          }}
          onCancel={() => setShowAdd(false)}
          isPending={createMember.isPending}
        />
      )}

      {members.length === 0 && !showAdd && (
        <p className="py-12 text-center text-gray-400">
          No team members yet. Add people to start assigning work.
        </p>
      )}

      {/* Member list */}
      <div className="space-y-2">
        {members.map((m) =>
          editingId === m.id ? (
            <EditMemberRow
              key={m.id}
              member={m}
              onSave={(data) => {
                updateMember.mutate({ memberId: m.id, data }, { onSuccess: () => setEditingId(null) });
              }}
              onCancel={() => setEditingId(null)}
              isPending={updateMember.isPending}
            />
          ) : (
            <MemberRow
              key={m.id}
              member={m}
              onEdit={() => setEditingId(m.id)}
              onDelete={() => {
                if (confirm(`Remove ${m.name} from the team?`)) {
                  deleteMember.mutate(m.id);
                }
              }}
              inviteUrl={inviteUrls[m.id] ?? null}
              onInvite={() => handleInvite(m.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}

// --- Read-only member row ---
function MemberRow({
  member: m,
  onEdit,
  onDelete,
  inviteUrl,
  onInvite,
}: {
  member: ProjectMember;
  onEdit: () => void;
  onDelete: () => void;
  inviteUrl: string | null;
  onInvite: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <Avatar name={m.name} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{m.name}</p>
          <div className="flex gap-3 text-xs text-gray-500">
            {m.email && <span>{m.email}</span>}
            {m.phone && <span>{m.phone}</span>}
          </div>
        </div>
        <Badge variant={roleColors[m.jobRole] ?? 'secondary'}>
          {m.jobRole.toUpperCase()}
        </Badge>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button size="xs" variant="ghost" className="text-red-500 hover:text-red-700" onClick={onDelete}>
            Remove
          </Button>
          {m.email && !inviteUrl && (
            <Button size="xs" variant="outline" onClick={onInvite}>Invite</Button>
          )}
        </div>
      </div>
      {inviteUrl && (
        <div className="ml-12 mt-1 flex items-center gap-2 rounded bg-green-50 px-3 py-1.5 text-xs">
          <span className="text-green-700">Invite link:</span>
          <input
            readOnly
            value={inviteUrl}
            className="flex-1 bg-transparent text-green-800 outline-none"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
          >
            Copy
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Add member form ---
function AddMemberForm({
  onSubmit,
  onCancel,
  isPending,
}: {
  onSubmit: (data: { name: string; email?: string; phone?: string; job_role: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobRole, setJobRole] = useState('dev');

  return (
    <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50/30 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-900">Add Team Member</h3>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Name *</label>
          <Input autoFocus placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
          <Input placeholder="jane@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
          <Input placeholder="+1 555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Role *</label>
          <Select value={jobRole} onChange={(e) => setJobRole(e.target.value)}>
            {JOB_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label} — {roleName(r.value)}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!name.trim()) return;
            const data: { name: string; email?: string; phone?: string; job_role: string } = {
              name: name.trim(),
              job_role: jobRole,
            };
            if (email.trim()) data.email = email.trim();
            if (phone.trim()) data.phone = phone.trim();
            onSubmit(data);
          }}
          disabled={!name.trim() || isPending}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// --- Edit member row (inline) ---
function EditMemberRow({
  member: m,
  onSave,
  onCancel,
  isPending,
}: {
  member: ProjectMember;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(m.name);
  const [email, setEmail] = useState(m.email ?? '');
  const [phone, setPhone] = useState(m.phone ?? '');
  const [jobRole, setJobRole] = useState(m.jobRole);

  const submit = () => {
    const data: Record<string, unknown> = {};
    if (name !== m.name) data.name = name;
    if (email !== (m.email ?? '')) data.email = email || null;
    if (phone !== (m.phone ?? '')) data.phone = phone || null;
    if (jobRole !== m.jobRole) data.job_role = jobRole;
    if (Object.keys(data).length === 0) { onCancel(); return; }
    onSave(data);
  };

  return (
    <div className="rounded-lg border border-brand-300 bg-brand-50/20 px-4 py-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Role</label>
          <Select value={jobRole} onChange={(e) => setJobRole(e.target.value)}>
            {JOB_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="xs" onClick={submit} disabled={!name.trim() || isPending}>Save</Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function roleName(role: string): string {
  const names: Record<string, string> = {
    pm: 'Project Manager',
    po: 'Product Owner',
    bsa: 'Business Systems Analyst',
    ba: 'Business Analyst',
    qe: 'Quality Engineer',
    ux: 'UX Designer',
    dev: 'Developer',
  };
  return names[role] ?? role;
}
