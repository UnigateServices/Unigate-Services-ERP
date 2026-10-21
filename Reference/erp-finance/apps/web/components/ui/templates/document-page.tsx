'use client';

import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../button';
import { DocumentStepper, StepDef, StepperStage } from '../document-stepper';
import '../../enterprise.css';
import './templates.css';

export type DocAction = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean };

type Props = {
  /** Label of the back button, e.g. "الفواتير" → "← الفواتير". */
  backLabel: string;
  onBack: () => void;
  /** Document title, e.g. "فاتورة SI-0012". */
  title: ReactNode;
  /** Status badge shown beside the title. */
  badge?: ReactNode;
  stage: StepperStage | string;
  /** Custom step path (e.g. quotes). */
  steps?: StepDef[];
  /** Hide the stepper entirely (reports, valuations). */
  hideStepper?: boolean;
  /** Tool buttons in the header (print, register payment …). */
  tools?: ReactNode;
  /** Primary header actions (save draft, approve & post). Rendered after tools. */
  actions?: ReactNode;
  /** Overflow "⋯" menu for secondary / destructive actions. */
  menu?: DocAction[];
  /** id of the <form> wrapping header + lines. Header submit buttons target it. */
  formId: string;
  onSubmit: (event: FormEvent) => void;
  /** Ctrl+S is only honoured while true (i.e. document is editable). */
  canSave?: boolean;
  /** Ctrl+Enter handler (approve / post). Omit to disable. */
  onPrimary?: () => void;
  /** Document header fields (children of a 4-column grid). */
  header: ReactNode;
  /** Lines card content (title row + table). */
  lines?: ReactNode;
  /** Totals block shown at the bottom of the document card, under the lines. */
  totals?: ReactNode;
  /** Sidebar: live accounting impact (<JournalImpact/>). */
  journal?: ReactNode;
  /** Sidebar: payments / settlements linked to the document. */
  related?: ReactNode;
  /** Sidebar: attachments. Hidden entirely when not provided. */
  attachments?: ReactNode;
  /** Red notice banner below the stepper. */
  notice?: ReactNode;
  className?: string;
};

export function DocumentPage({
  backLabel,
  onBack,
  title,
  badge,
  stage,
  steps,
  hideStepper,
  tools,
  actions,
  menu,
  formId,
  onSubmit,
  canSave = false,
  onPrimary,
  header,
  lines,
  totals,
  journal,
  related,
  attachments,
  notice,
  className = '',
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef({ canSave, onPrimary });
  saveRef.current = { canSave, onPrimary };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's' && saveRef.current.canSave) {
        event.preventDefault();
        (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
      } else if (event.key === 'Enter' && saveRef.current.onPrimary) {
        event.preventDefault();
        saveRef.current.onPrimary();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formId]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const items = (menu ?? []).filter(Boolean);
  const hasAside = Boolean(journal || related || attachments);

  return (
    <div className={`ent-page dp ${className}`.trim()}>
      <header className="tp-head dp-head">
        <Button variant="ghost" className="tp-back" onClick={onBack}>
          → {backLabel}
        </Button>
        <h1 className="tp-title">
          {title}
          {badge}
        </h1>
        <div className="tp-head-end">
          {tools}
          {actions}
          {items.length > 0 ? (
            <div className="tp-more" ref={menuRef}>
              <Button variant="secondary" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                ⋯
              </Button>
              {menuOpen ? (
                <div className="tp-more-list" role="menu">
                  {items.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      disabled={action.disabled}
                      className={action.danger ? 'is-danger' : undefined}
                      onClick={() => {
                        setMenuOpen(false);
                        action.onClick();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {hideStepper ? null : (
        <div className="dp-stepper">
          <DocumentStepper stage={stage} steps={steps} />
        </div>
      )}
      {notice ? <div className="dp-notice" role="status">{notice}</div> : null}

      <div className={`dp-body${hasAside ? '' : ' is-single'}`}>
        <form
          id={formId}
          className="dp-main"
          onSubmit={onSubmit}
          onKeyDown={(event) => {
            // Enter must never submit a document by accident; saving is Ctrl+S or the header button.
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'submit') event.preventDefault();
          }}
        >
          <section className="dp-sheet">
            <div className="dp-fields">{header}</div>
            {lines ? <div className="dp-lines">{lines}</div> : null}
            {totals ? <div className="dp-totals">{totals}</div> : null}
          </section>
        </form>
        {hasAside ? (
          <aside className="dp-aside" aria-label="القيد والعمليات المرتبطة">
            {journal}
            {related}
            {attachments}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Row helpers for the totals block. */
export function SummaryList({ children }: { children: ReactNode }) {
  return <dl className="dp-sum">{children}</dl>;
}

export function SummaryRow({ label, value, net, warn }: { label: ReactNode; value: ReactNode; net?: boolean; warn?: boolean }) {
  return (
    <div className={`${net ? 'is-net' : ''}${warn ? ' is-warn' : ''}`.trim() || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
