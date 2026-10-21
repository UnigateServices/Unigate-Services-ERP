'use client';

export type StepperStage = 'DRAFT' | 'PENDING' | 'POSTED' | 'PARTIAL' | 'CLOSED' | 'VOID';

const STEPS: { key: Exclude<StepperStage, 'VOID'>; ar: string; en: string }[] = [
  { key: 'DRAFT', ar: 'مسودة', en: 'Draft' },
  { key: 'PENDING', ar: 'بانتظار الموافقة', en: 'Pending' },
  { key: 'POSTED', ar: 'مرحّل', en: 'Posted' },
  { key: 'PARTIAL', ar: 'مسدد جزئياً', en: 'Partial' },
  { key: 'CLOSED', ar: 'مغلق', en: 'Closed' },
];

/** Map a sales/purchase invoice status + payment state to a stepper stage. */
export function invoiceStage(status: string, paymentState?: string): StepperStage {
  if (status === 'VOID') return 'VOID';
  if (status === 'DRAFT') return 'DRAFT';
  if (paymentState === 'PAID') return 'CLOSED';
  if (paymentState === 'PARTIAL') return 'PARTIAL';
  return 'POSTED';
}

/** Map quote status to a stepper stage. */
export function quoteStage(status: string, converted?: boolean): StepperStage {
  if (status === 'REJECTED' || status === 'EXPIRED') return 'VOID';
  if (converted) return 'CLOSED';
  if (status === 'ACCEPTED') return 'POSTED';
  if (status === 'SENT') return 'PENDING';
  return 'DRAFT';
}

/** Cash vouchers & custody: posted unless pending approval / reversed. */
export function voucherStage(status?: string, pending?: boolean, closed?: boolean): StepperStage {
  if (status === 'VOID' || status === 'REVERSED' || status === 'CANCELLED') return 'VOID';
  if (pending || status === 'PENDING') return 'PENDING';
  if (status === 'DRAFT') return 'DRAFT';
  if (closed || status === 'COMPLETED' || status === 'CLOSED') return 'CLOSED';
  if (status === 'PARTIAL') return 'PARTIAL';
  return 'POSTED';
}

export type StepDef = { key: string; ar: string; en: string };

/** Quote-specific path. */
export const QUOTE_STEPS: StepDef[] = [
  { key: 'DRAFT', ar: 'مسودة', en: 'Draft' },
  { key: 'SENT', ar: 'مرسل للزبون', en: 'Sent' },
  { key: 'ACCEPTED', ar: 'مقبول', en: 'Accepted' },
  { key: 'CONVERTED', ar: 'محوّل لفاتورة', en: 'Invoiced' },
];

export function quoteStep(status: string, converted?: boolean): string {
  if (status === 'REJECTED' || status === 'EXPIRED') return 'VOID';
  if (converted) return 'CONVERTED';
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (status === 'SENT') return 'SENT';
  return 'DRAFT';
}

export function DocumentStepper({ stage, className = '', steps = STEPS }: { stage: StepperStage | string; className?: string; steps?: StepDef[] }) {
  const voided = stage === 'VOID';
  const index = voided ? -1 : steps.findIndex((step) => step.key === stage);
  return (
    <ol className={`ds-stepper${voided ? ' is-void' : ''} ${className}`.trim()} aria-label="مسار المستند">
      {steps.map((step, i) => {
        const state = voided ? 'is-idle' : i < index ? 'is-done' : i === index ? 'is-current' : 'is-idle';
        return (
          <li key={step.key} className={`ds-step ${state}`} aria-current={state === 'is-current' ? 'step' : undefined}>
            <span className="ds-dot">{state === 'is-done' ? '✓' : i + 1}</span>
            <span className="ds-label">
              {step.ar}
              <small>{step.en}</small>
            </span>
          </li>
        );
      })}
      {voided ? (
        <li className="ds-step is-void-mark" aria-current="step">
          <span className="ds-dot">✕</span>
          <span className="ds-label">
            ملغى
            <small>Void</small>
          </span>
        </li>
      ) : null}
    </ol>
  );
}
