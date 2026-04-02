import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Badge, Input } from '@projecta/ui';
import { useOrgsList, useCreateOrg, useArchiveOrg, useUnarchiveOrg, useDeleteOrg } from '../hooks/use-orgs-management';

export function OrgsPage() {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { data: orgs = [], isLoading } = useOrgsList(showArchived);
  const archiveOrg = useArchiveOrg();
  const unarchiveOrg = useUnarchiveOrg();
  const deleteOrg = useDeleteOrg();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('orgs.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('orgs.orgCount', { count: orgs.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('orgs.showArchived')}
          </label>
          <Button size="sm" onClick={() => setShowCreate(true)}>{t('orgs.newOrganisation')}</Button>
        </div>
      </div>

      {showCreate && <CreateOrgForm onClose={() => setShowCreate(false)} />}

      {orgs.length === 0 && (
        <p className="py-12 text-center text-gray-400">
          {t('orgs.noOrgsYet')}
        </p>
      )}

      <div className="space-y-3">
        {orgs.map((org) => (
          <div
            key={org.id}
            className={`rounded-lg border bg-white p-4 ${org.archivedAt ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/orgs/$orgId"
                    params={{ orgId: org.id }}
                    className="text-base font-medium text-gray-900 hover:text-brand-700"
                  >
                    {org.name}
                  </Link>
                  {org.archivedAt && <Badge variant="secondary">{t('orgs.archived')}</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  {org.contactName && <span>{org.contactName}</span>}
                  {org.contactEmail && <span>{org.contactEmail}</span>}
                  {org.contactPhone && <span>{org.contactPhone}</span>}
                  {org.city && org.state && <span>{org.city}, {org.state}</span>}
                  {org.country && <span>{org.country}</span>}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {t('orgs.added', { date: new Date(org.createdAt).toLocaleDateString() })}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to="/orgs/$orgId" params={{ orgId: org.id }}>
                  <Button size="xs" variant="outline">{t('common.edit')}</Button>
                </Link>
                {org.archivedAt ? (
                  <Button size="xs" variant="outline" onClick={() => unarchiveOrg.mutate(org.id)}>
                    {t('common.restore')}
                  </Button>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => archiveOrg.mutate(org.id)}>
                    {t('common.archive')}
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => {
                    if (confirm(t('orgs.confirmDelete'))) {
                      deleteOrg.mutate(org.id);
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateOrgForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateOrg();
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    const data: Record<string, unknown> = { name: name.trim() };
    if (contactName.trim()) data.contact_name = contactName.trim();
    if (contactEmail.trim()) data.contact_email = contactEmail.trim();
    if (contactPhone.trim()) data.contact_phone = contactPhone.trim();
    if (addressLine1.trim()) data.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) data.address_line2 = addressLine2.trim();
    if (city.trim()) data.city = city.trim();
    if (state.trim()) data.state = state.trim();
    if (postalCode.trim()) data.postal_code = postalCode.trim();
    if (country.trim()) data.country = country.trim();
    create.mutate(data, { onSuccess: onClose });
  };

  return (
    <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50/30 p-4 space-y-3">
      <h3 className="font-medium text-gray-900">{t('orgs.newOrg')}</h3>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.orgNameRequired')}</label>
        <Input autoFocus placeholder="Acme Corporation" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.contactName')}</label>
          <Input placeholder="Jane Smith" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.contactEmail')}</label>
          <Input placeholder="jane@acme.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.contactPhone')}</label>
          <Input placeholder="+1 555-0100" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.addressLine1')}</label>
          <Input placeholder="123 Main St" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.addressLine2')}</label>
          <Input placeholder="Suite 100" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.city')}</label>
          <Input placeholder="San Francisco" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.state')}</label>
          <Input placeholder="CA" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.postalCode')}</label>
          <Input placeholder="94105" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('orgs.country')}</label>
          <Input placeholder="US" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={submit} disabled={!name.trim() || create.isPending}>{t('common.create')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}
