import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from '@tanstack/react-router';
import { Button, Input } from '@projecta/ui';
import { api } from '../lib/api-client';
import { useAuth } from '../auth/auth-context';

interface InviteInfo {
  id: string;
  email: string;
  projectName: string;
  orgName: string;
  jobRole: string;
  expiresAt: string;
  acceptedAt: string | null;
}

function toInviteInfo(w: Record<string, unknown>): InviteInfo {
  return {
    id: w.id as string,
    email: w.email as string,
    projectName: w.project_name as string,
    orgName: w.org_name as string,
    jobRole: w.job_role as string,
    expiresAt: w.expires_at as string,
    acceptedAt: (w.accepted_at as string) ?? null,
  };
}

const roleNames: Record<string, string> = {
  pm: 'Project Manager',
  po: 'Product Owner',
  bsa: 'Business Systems Analyst',
  ba: 'Business Analyst',
  qe: 'Quality Engineer',
  ux: 'UX Designer',
  dev: 'Developer',
};

export function InvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const { login } = useAuth();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    api.get<Record<string, unknown>>(`/invitations/${token}`)
      .then((raw) => setInfo(toInviteInfo(raw)))
      .catch((err) => setError(err.message ?? 'Invitation not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    setSubmitError('');
    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ token: string }>(`/invitations/${token}/accept`, {
        name: name.trim(),
        password,
      });
      await login(res.token);
      navigate({ to: '/' });
    } catch (err: any) {
      setSubmitError(err.message ?? 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <div className="max-w-sm space-y-4 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Invalid Invitation</h1>
          <p className="text-gray-600">{error || 'This invitation link is not valid.'}</p>
          <Link to="/login">
            <Button className="mt-4">Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (info.acceptedAt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <div className="max-w-sm space-y-4 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Already Accepted</h1>
          <p className="text-gray-600">This invitation has already been used. You can log in with your credentials.</p>
          <Link to="/login">
            <Button className="mt-4">Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  const expired = new Date(info.expiresAt) < new Date();
  if (expired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <div className="max-w-sm space-y-4 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Invitation Expired</h1>
          <p className="text-gray-600">This invitation has expired. Please ask your team to send a new one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Plan<span className="text-brand-600">A</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">You've been invited to join a project</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-sm text-gray-500">{info.orgName}</p>
          <p className="text-lg font-semibold text-gray-900">{info.projectName}</p>
          <p className="mt-1 text-sm text-brand-600">
            {roleNames[info.jobRole] ?? info.jobRole.toUpperCase()}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <Input value={info.email} disabled className="bg-gray-50" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Your Name</label>
            <Input
              autoFocus
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <Input
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
            <Input
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}

          <Button
            className="w-full justify-center"
            onClick={submit}
            disabled={!name.trim() || !password || !confirmPassword || submitting}
          >
            {submitting ? 'Creating account...' : 'Create Account & Join'}
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
