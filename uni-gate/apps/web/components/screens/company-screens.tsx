'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { PrimaryButton } from '@/components/primary-button';
import { ConfirmDialog, PageHeader, PlatformShell, StatusBadge } from '@/components/shell';
import { formatDate, formatUsd, isPastDate, todayDamascus } from '@/lib/dates';
import { moduleLabel } from '@/lib/messages';
import { usePreferences } from '@/lib/preferences';
import { writeSupportSession } from '@/lib/session';
import { useGate } from '@/lib/use-gate';
import {
  activateCompany,
  codeIssue,
  companyCounts,
  createCompany,
  enterCompany,
  getCompany,
  listModules,
  setModules,
  suspendCompany,
  updateCompany,
} from '@/services/directory';
import { MODULE_KEYS, type ModuleKey, type RolePreset } from '@/types/auth';

export function CompanyFormScreen({ companyId }: { companyId?: string }) {
  const session = useGate('platform');
  const router = useRouter();
  const { messages } = usePreferences();
  const existing = companyId ? getCompany(companyId) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [price, setPrice] = useState(existing ? String(existing.priceUsd) : '');
  const [expiresOn, setExpiresOn] = useState(existing?.expiresOn ?? '');
  const [preset, setPreset] = useState<RolePreset>('simple');
  const [selected, setSelected] = useState<ModuleKey[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [activateDate, setActivateDate] = useState(todayDamascus());

  if (!session) return <p role="status">{messages.checking}</p>;
  if (companyId && !existing) return <PlatformShell session={session}><p>{messages.notFound}</p></PlatformShell>;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = messages.required;
    if (!code.trim()) next.code = messages.required;
    else if (codeIssue(code.trim().toLowerCase())) next.code = messages.codeInvalid;
    if (price.trim() === '' || Number.isNaN(Number(price)) || Number(price) < 0) next.price = messages.required;
    if (!expiresOn) next.expiresOn = messages.required;
    setErrors(next);
    if (Object.keys(next).length || !session) return;
    const payload = { name, code, priceUsd: Number(price), expiresOn };
    const result = existing
      ? updateCompany(existing.id, payload, { id: session.userId, name: session.name })
      : createCompany({ ...payload, preset, modules: selected }, { id: session.userId, name: session.name });
    if (!result.ok) {
      setErrors({ code: result.code === 'CODE_TAKEN' ? messages.codeTaken : messages.network });
      return;
    }
    router.push(`/platform/companies/${result.company.id}`);
  }

  return (
    <PlatformShell session={session}>
      <PageHeader
        title={existing ? messages.editSubscription : messages.createCompany}
        crumbs={[
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
          { label: existing ? existing.name : messages.newCompany },
        ]}
      />
      <form className="stack-form" onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>{messages.identity}</legend>
          <FormField id="name" label={messages.name} required error={errors.name}>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField id="code" label={messages.code} required hint={messages.codeHint} error={errors.code}>
            <input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value.toLowerCase())}
              autoComplete="off"
            />
          </FormField>
        </fieldset>
        <fieldset>
          <legend>{messages.subscription}</legend>
          <FormField id="price" label={messages.price} required error={errors.price}>
            <input id="price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
          </FormField>
          <FormField id="expires" label={messages.expires} required error={errors.expiresOn}>
            <input id="expires" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          </FormField>
          {expiresOn && isPastDate(expiresOn) ? <InlineAlert tone="info" message={messages.datePastNotice} /> : null}
        </fieldset>
        {!existing ? (
          <fieldset>
            <legend>{messages.preset}</legend>
            <label className="choice">
              <input type="radio" name="preset" checked={preset === 'tradivia'} onChange={() => setPreset('tradivia')} />
              <span>
                <strong>{messages.presetTradiv}</strong>
                <small>{messages.presetTradivHint}</small>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="preset" checked={preset === 'simple'} onChange={() => setPreset('simple')} />
              <span>
                <strong>{messages.presetSimple}</strong>
                <small>{messages.presetSimpleHint}</small>
              </span>
            </label>
          </fieldset>
        ) : null}
        {!existing ? (
          <fieldset>
            <legend>{messages.modulesSection}</legend>
            <p className="field-hint">{messages.modulesHint}</p>
            {MODULE_KEYS.map((key) => (
              <label key={key} className="choice">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
                    )
                  }
                />
                <span>{moduleLabel(key, messages)}</span>
              </label>
            ))}
            <p className="field-hint">{messages.branchHint}</p>
          </fieldset>
        ) : null}
        {notice ? <InlineAlert tone="success" message={notice} /> : null}
        <PrimaryButton>{messages.save}</PrimaryButton>
      </form>
      {existing ? (
        <section className="danger-zone">
          <h2>{messages.dangerZone}</h2>
          {existing.status === 'ACTIVE' ? (
            <button type="button" className="danger-button" onClick={() => setConfirmSuspend(true)}>
              {messages.suspendCompany}
            </button>
          ) : (
            <div className="stack-form">
              <FormField id="activate-date" label={messages.activateNeedsDate} required>
                <input id="activate-date" type="date" value={activateDate} onChange={(event) => setActivateDate(event.target.value)} />
              </FormField>
              <button type="button" className="primary-button" onClick={() => setConfirmActivate(true)}>
                {messages.activateCompany}
              </button>
            </div>
          )}
        </section>
      ) : null}
      <ConfirmDialog
        open={confirmSuspend}
        title={messages.suspendCompany}
        body={messages.suspendBody}
        confirmLabel={messages.suspendCompany}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => {
          if (!existing) return;
          suspendCompany(existing.id, { id: session.userId, name: session.name });
          setConfirmSuspend(false);
          setNotice(messages.saved);
          router.refresh();
          window.location.assign(`/platform/companies/${existing.id}/edit`);
        }}
      />
      <ConfirmDialog
        open={confirmActivate}
        title={messages.activateCompany}
        body={messages.activateNeedsDate}
        confirmLabel={messages.activateCompany}
        onClose={() => setConfirmActivate(false)}
        onConfirm={() => {
          if (!existing) return;
          const result = activateCompany(existing.id, activateDate, { id: session.userId, name: session.name });
          if (!result.ok) {
            setErrors({ expiresOn: messages.datePastNotice });
            setConfirmActivate(false);
            return;
          }
          window.location.assign(`/platform/companies/${existing.id}/edit`);
        }}
      />
    </PlatformShell>
  );
}

export function CompanyDetailsScreen({ companyId }: { companyId: string }) {
  const session = useGate('platform');
  const { messages, lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const company = getCompany(companyId);
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!company) {
    return (
      <PlatformShell session={session}>
        <p>{messages.notFound}</p>
      </PlatformShell>
    );
  }
  const counts = companyCounts(company.id);
  const enabled = listModules(company.id).filter((item) => item.enabled);
  return (
    <PlatformShell session={session}>
      <PageHeader
        title={company.name}
        crumbs={[
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
          { label: company.name },
        ]}
        actions={
          <>
            <button type="button" className="primary-button" onClick={() => setOpen(true)}>
              {messages.enterCompany}
            </button>
            <Link className="secondary-button link-button" href={`/platform/companies/${company.id}/edit`}>
              {messages.editSubscription}
            </Link>
          </>
        }
      />
      {company.status === 'SUSPENDED' ? <InlineAlert tone="info" message={messages.suspendBody} /> : null}
      <dl className="facts">
        <div>
          <dt>{messages.status}</dt>
          <dd>
            <StatusBadge status={company.status} />
          </dd>
        </div>
        <div>
          <dt>{messages.code}</dt>
          <dd>{company.code}</dd>
        </div>
        <div>
          <dt>{messages.expires}</dt>
          <dd>{formatDate(company.expiresOn, lang)}</dd>
        </div>
        <div>
          <dt>{messages.price}</dt>
          <dd>{formatUsd(company.priceUsd, lang)}</dd>
        </div>
        <div>
          <dt>{messages.countsBranches}</dt>
          <dd>{counts.branches}</dd>
        </div>
        <div>
          <dt>{messages.countsUsers}</dt>
          <dd>{counts.users}</dd>
        </div>
      </dl>
      <div className="link-row">
        <Link href={`/platform/companies/${company.id}/branches`}>{messages.navBranches}</Link>
        <Link href={`/platform/companies/${company.id}/users`}>{messages.navUsers}</Link>
        <Link href={`/platform/companies/${company.id}/roles`}>{messages.navRoles}</Link>
        <Link href={`/platform/companies/${company.id}/modules`}>{messages.navModules}</Link>
      </div>
      <h2>{messages.enabledModules}</h2>
      {enabled.length === 0 ? (
        <p>{messages.none}</p>
      ) : (
        <ul>
          {enabled.map((item) => (
            <li key={item.moduleKey}>
              {moduleLabel(item.moduleKey, messages)} — {messages.notReadyYet}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={open}
        title={messages.enterTitle}
        body={`${company.name}. ${messages.enterBody}`}
        confirmLabel={messages.enterCompany}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          const result = enterCompany(session, company.id);
          if (!result.ok) return;
          writeSupportSession(session, company.id);
          window.location.assign('/app');
        }}
      />
    </PlatformShell>
  );
}

export function CompanyModulesScreen({ companyId }: { companyId: string }) {
  const session = useGate('platform');
  const { messages } = usePreferences();
  const company = getCompany(companyId);
  const initial = company ? listModules(company.id).filter((item) => item.enabled).map((item) => item.moduleKey) : [];
  const [selected, setSelected] = useState<ModuleKey[]>(initial);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!company) return <PlatformShell session={session}><p>{messages.notFound}</p></PlatformShell>;
  const turningOff = initial.filter((key) => !selected.includes(key));

  function persist() {
    setModules(companyId, selected, { id: session!.userId, name: session!.name });
    setSaved(true);
    setConfirm(false);
  }

  return (
    <PlatformShell session={session}>
      <PageHeader
        title={messages.modulesTitle}
        crumbs={[
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
          { href: `/platform/companies/${company.id}`, label: company.name },
          { label: messages.navModules },
        ]}
      />
      {saved ? <InlineAlert tone="success" message={messages.saved} /> : null}
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (turningOff.length) setConfirm(true);
          else persist();
        }}
      >
        {MODULE_KEYS.map((key) => (
          <label key={key} className="choice">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={() =>
                setSelected((current) =>
                  current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
                )
              }
            />
            <span>
              {moduleLabel(key, messages)} <small>{messages.notReadyYet}</small>
            </span>
          </label>
        ))}
        <PrimaryButton>{messages.save}</PrimaryButton>
      </form>
      <ConfirmDialog
        open={confirm}
        title={messages.modulesTitle}
        body={messages.disableModuleBody}
        confirmLabel={messages.save}
        onClose={() => setConfirm(false)}
        onConfirm={persist}
      />
    </PlatformShell>
  );
}
