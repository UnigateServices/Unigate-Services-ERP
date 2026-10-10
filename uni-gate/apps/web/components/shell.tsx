'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LanguageSwitcher, ThemeModeSwitcher } from '@/components/preference-switchers';
import { usePreferences } from '@/lib/preferences';
import { leaveSupportCompany, logout } from '@/lib/session';
import type { AppSession } from '@/types/auth';

type NavItem = { href: string; label: string };

function ShellFrame({
  contextLabel,
  brand,
  items,
  session,
  children,
  banner,
}: {
  contextLabel: string;
  brand: string;
  items: NavItem[];
  session: AppSession;
  children: ReactNode;
  banner?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { messages } = usePreferences();
  const [open, setOpen] = useState(false);
  const supportCompany = session.actor === 'platform' ? session.actingCompany : null;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="app-shell">
      {open ? (
        <button type="button" className="backdrop" aria-label={messages.closeMenu} onClick={() => setOpen(false)} />
      ) : null}
      <aside className={open ? 'sidebar is-open' : 'sidebar'}>
        <div className="sidebar-brand">
          <strong>Unigate</strong>
          <span>{brand}</span>
        </div>
        <nav aria-label={contextLabel}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        {banner}
        <header className="topbar">
          <button type="button" className="menu-toggle secondary-button" onClick={() => setOpen(true)}>
            {messages.menu}
          </button>
          <p className="context-label">
            <span className="context-word">{contextLabel}</span>
          </p>
          {supportCompany && !banner ? (
            <p className="support-chip">
              {messages.supportStillOpen}: {supportCompany.name}
            </p>
          ) : null}
          <div className="topbar-tools">
            <LanguageSwitcher />
            <ThemeModeSwitcher />
            <Link className="text-link" href={session.actor === 'platform' ? '/platform/account' : '/app/account'}>
              {session.name}
            </Link>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void logout().then(() => {
                  router.replace(session.actor === 'platform' ? '/login/platform' : '/login');
                });
              }}
            >
              {messages.logout}
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

export function PlatformShell({ session, children }: { session: AppSession; children: ReactNode }) {
  const { messages } = usePreferences();
  return (
    <ShellFrame
      session={session}
      contextLabel={messages.platformContext}
      brand={messages.platformEyebrow}
      items={[
        { href: '/platform', label: messages.navDashboard },
        { href: '/platform/companies', label: messages.navCompanies },
        { href: '/platform/audit', label: messages.navAudit },
      ]}
    >
      {children}
    </ShellFrame>
  );
}

export function AppShell({
  session,
  items,
  children,
}: {
  session: AppSession;
  items: NavItem[];
  children: ReactNode;
}) {
  const { messages } = usePreferences();
  const support = session.actor === 'platform' ? session.actingCompany : null;
  const companyName = support?.name ?? session.companyName;
  const suspended = support?.status === 'SUSPENDED';
  const banner =
    session.actor === 'platform' && support ? (
      <SupportBanner companyId={support.id} companyName={support.name} suspended={suspended} />
    ) : null;
  return (
    <ShellFrame
      session={session}
      contextLabel={companyName ? `${messages.companyContext} ${companyName}` : messages.companyContext}
      brand={companyName ?? messages.companyContext}
      items={items}
      banner={banner}
    >
      {children}
    </ShellFrame>
  );
}

function SupportBanner({
  companyId,
  companyName,
  suspended,
}: {
  companyId: string;
  companyName: string;
  suspended: boolean;
}) {
  const { messages } = usePreferences();
  const router = useRouter();
  return (
    <div className="support-banner" role="status">
      <p>
        <strong>{messages.supportBanner}</strong> {companyName}
        {suspended ? <span className="banner-note"> — {messages.supportSuspended}</span> : null}
      </p>
      <div className="banner-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void leaveSupportCompany(companyId).then((result) => {
              if (!result.ok) return;
              router.push(`/platform/companies/${companyId}`);
            });
          }}
        >
          {messages.leaveCompany}
        </button>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  crumbs,
  actions,
}: {
  title: string;
  crumbs?: { href?: string; label: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      {crumbs && crumbs.length > 0 ? (
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 ? <span className="crumb-sep" aria-hidden="true">/</span> : null}
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="page-header-row">
        <h1>{title}</h1>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }) {
  const { messages } = usePreferences();
  const label =
    status === 'ACTIVE' ? messages.active : status === 'SUSPENDED' ? messages.suspended : messages.inactiveStatus;
  return <span className={`badge badge-${status.toLowerCase()}`}>{label}</span>;
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const { messages } = usePreferences();
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {messages.previous}
      </button>
      <span>
        {messages.page} {page} {messages.of} {pages}
      </span>
      <button type="button" className="secondary-button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {messages.next}
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { messages } = usePreferences();
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {messages.cancel}
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
