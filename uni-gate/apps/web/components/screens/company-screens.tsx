'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { PrimaryButton } from '@/components/primary-button';
import { ConfirmDialog, PageHeader, PlatformShell, StatusBadge } from '@/components/shell';
import { formatDate, formatUsd, isPastDate, todayDamascus } from '@/lib/dates';
import { moduleLabel } from '@/lib/messages';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';
import { codeIssue, getCompany, listModules, setModules } from '@/services/directory';
import {
  activatePlatformCompany,
  createPlatformCompany,
  enterPlatformCompany,
  getPlatformCompany,
  suspendPlatformCompany,
  updatePlatformCompany,
  type PlatformCompany,
} from '@/services/platform-companies';
import { MODULE_KEYS, type ModuleKey, type RolePreset } from '@/types/auth';

export function CompanyFormScreen({ companyId }: { companyId?: string }) {
  const session = useGate('platform');
  const router = useRouter();
  const { messages } = usePreferences();
  const [loaded, setLoaded] = useState<PlatformCompany | null>(null);
  const [ready, setReady] = useState(!companyId);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [preset, setPreset] = useState<RolePreset>('simple');
  const [selected, setSelected] = useState<ModuleKey[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [activateDate, setActivateDate] = useState(todayDamascus());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getPlatformCompany(companyId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setMissing(result.code === 'NOT_FOUND');
        setLoadError(result.code === 'NOT_FOUND' ? '' : messages.network);
        setReady(true);
        return;
      }
      setLoaded(result.company);
      setName(result.company.name);
      setCode(result.company.code);
      setPrice(result.company.priceUsd);
      setExpiresOn(result.company.expiresOn);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, messages.network]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  if (loadError) {
    return (
      <PlatformShell session={session}>
        <InlineAlert message={loadError} />
      </PlatformShell>
    );
  }
  if (companyId && (missing || !loaded)) {
    return (
      <PlatformShell session={session}>
        <p>{messages.notFound}</p>
      </PlatformShell>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = messages.required;
    if (!code.trim()) next.code = messages.required;
    else if (codeIssue(code.trim().toLowerCase())) next.code = messages.codeInvalid;
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(price.trim())) next.price = messages.required;
    if (!expiresOn) next.expiresOn = messages.required;
    setErrors(next);
    if (Object.keys(next).length || !session) return;
    setSubmitting(true);
    const payload = { name: name.trim(), code: code.trim().toLowerCase(), priceUsd: price.trim(), expiresOn };
    const result = loaded
      ? await updatePlatformCompany(loaded.id, payload)
      : await createPlatformCompany({ ...payload, preset, modules: selected });
    setSubmitting(false);
    if (!result.ok || !result.company) {
      setErrors({ code: result.ok ? messages.network : result.code === 'CODE_TAKEN' ? messages.codeTaken : messages.network });
      return;
    }
    router.push(`/platform/companies/${result.company.id}`);
  }

  return (
    <PlatformShell session={session}>
      <PageHeader
        title={loaded ? messages.editSubscription : messages.createCompany}
        crumbs={[
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
          { label: loaded ? loaded.name : messages.newCompany },
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
        {!loaded ? (
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
        {!loaded ? (
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
        <PrimaryButton disabled={submitting}>{submitting ? messages.submitting : messages.save}</PrimaryButton>
      </form>
      {loaded ? (
        <section className="danger-zone">
          <h2>{messages.dangerZone}</h2>
          {loaded.status === 'ACTIVE' ? (
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
          if (!loaded) return;
          void suspendPlatformCompany(loaded.id).then((result) => {
            setConfirmSuspend(false);
            if (!result.ok || !result.company) {
              setErrors({ code: messages.network });
              return;
            }
            setLoaded(result.company);
            setNotice(messages.saved);
          });
        }}
      />
      <ConfirmDialog
        open={confirmActivate}
        title={messages.activateCompany}
        body={messages.activateNeedsDate}
        confirmLabel={messages.activateCompany}
        onClose={() => setConfirmActivate(false)}
        onConfirm={() => {
          if (!loaded) return;
          void activatePlatformCompany(loaded.id, activateDate).then((result) => {
            setConfirmActivate(false);
            if (!result.ok || !result.company) {
              setErrors({ expiresOn: result.ok ? messages.network : result.code === 'DATE_PAST' ? messages.datePastNotice : messages.network });
              return;
            }
            setLoaded(result.company);
            setExpiresOn(result.company.expiresOn);
            setNotice(messages.saved);
          });
        }}
      />
    </PlatformShell>
  );
}

export function CompanyDetailsScreen({ companyId }: { companyId: string }) {
  const session = useGate('platform');
  const router = useRouter();
  const { messages, lang } = usePreferences();
  const [company, setCompany] = useState<PlatformCompany | null>(null);
  const [counts, setCounts] = useState({ branches: 0, users: 0 });
  const [modules, setModules] = useState<{ key: ModuleKey; enabled: boolean }[]>([]);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPlatformCompany(companyId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setMissing(result.code === 'NOT_FOUND');
        setLoadError(result.code === 'NOT_FOUND' ? '' : messages.network);
        setReady(true);
        return;
      }
      setCompany(result.company);
      setCounts(result.company.counts);
      setModules(result.company.modules);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, messages.network]);

  if (!session || !ready) return <p role="status">{messages.checking}</p>;
  if (loadError) {
    return (
      <PlatformShell session={session}>
        <InlineAlert message={loadError} />
      </PlatformShell>
    );
  }
  if (missing || !company) {
    return (
      <PlatformShell session={session}>
        <p>{messages.notFound}</p>
      </PlatformShell>
    );
  }
  const enabled = modules.filter((item) => item.enabled);
  const price = Number(company.priceUsd);
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
            <button
              type="button"
              className="primary-button"
              disabled={entering}
              onClick={() => {
                setEntering(true);
                setEnterError('');
                void enterPlatformCompany(company.id).then((result) => {
                  setEntering(false);
                  if (!result.ok) {
                    setEnterError(messages.network);
                    return;
                  }
                  router.push('/app');
                });
              }}
            >
              {entering ? messages.submitting : messages.enterCompany}
            </button>
            <Link className="secondary-button link-button" href={`/platform/companies/${company.id}/edit`}>
              {messages.editSubscription}
            </Link>
          </>
        }
      />
      {enterError ? <InlineAlert message={enterError} /> : null}
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
          <dd>{formatUsd(price, lang)}</dd>
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
      <p className="field-hint">{messages.pendingAreas}</p>
      <h2>{messages.enabledModules}</h2>
      {enabled.length === 0 ? (
        <p>{messages.none}</p>
      ) : (
        <ul>
          {enabled.map((item) => (
            <li key={item.key}>
              {moduleLabel(item.key, messages)} — {messages.notReadyYet}
            </li>
          ))}
        </ul>
      )}
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
