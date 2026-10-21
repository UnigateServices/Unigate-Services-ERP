'use client';

import { useState } from 'react';
import { AttachmentsModal } from './attachments-box';
import { AuthUser, attachmentCount, requestAuditDelete } from '../lib/api';
import { confirmAction, promptText } from '../lib/dialogs';
import { masterErrorMessage } from '../lib/master-errors';

type Props = {
  actor: AuthUser;
  reference: string;
  status: string;
  attachments?: string | null;
  editingReference?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
  labels?: {
    files: string;
    filesCount: (count: number) => string;
    pending: string;
    editing: string;
    edit: string;
    editRequest: string;
    delete: string;
    deleteRequest: string;
    reasonDelete: (reference: string) => string;
    confirmDelete: (reference: string) => string;
    deleteSent: (reference: string) => string;
    close: string;
    hint?: string;
    pendingSave?: string;
    removeFile?: string;
    uploadNow?: string;
    uploading?: string;
  };
};

export function OperationActions({
  actor,
  reference,
  status,
  attachments,
  editingReference,
  onEdit,
  onDelete,
  onChanged,
  onMessage,
  labels,
}: Props) {
  const [open, setOpen] = useState(false);
  const count = attachmentCount(attachments);
  const fileLabel = labels
    ? count
      ? labels.filesCount(count)
      : labels.files
    : count
      ? `مرفقات (${count})`
      : 'مرفقات';
  const attachBtn = (
    <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
      {fileLabel}
    </button>
  );
  const modal = open ? (
    <AttachmentsModal
      reference={reference}
      onClose={() => setOpen(false)}
      title={labels ? `${labels.files} ${reference}` : undefined}
      closeLabel={labels?.close}
      hint={labels?.hint}
      pendingLabel={labels?.pendingSave}
      removeLabel={labels?.removeFile}
      uploadLabel={labels?.uploadNow}
      uploadingLabel={labels?.uploading}
    />
  ) : null;

  if (status === 'PENDING_APPROVAL') {
    return (
      <div className="table-actions">
        {attachBtn}
        <span className="muted">{labels?.pending || 'بانتظار الموافقة'}</span>
        {modal}
      </div>
    );
  }
  if (status !== 'COMPLETED') {
    return modal;
  }
  if (editingReference === reference) {
    return (
      <div className="table-actions">
        {attachBtn}
        <span className="muted">{labels?.editing || 'قيد التعديل'}</span>
        {modal}
      </div>
    );
  }

  const isEmployee = actor.role === 'EMPLOYEE';
  const isMonitor = actor.role === 'MONITOR';

  if (isMonitor) {
    return (
      <div className="table-actions">
        {attachBtn}
        {modal}
      </div>
    );
  }

  return (
    <div className="table-actions">
      {attachBtn}
      <button type="button" className="btn-ghost" onClick={onEdit}>
        {isEmployee ? labels?.editRequest || 'طلب تعديل' : labels?.edit || 'تعديل'}
      </button>
      {isEmployee ? (
        <button
          type="button"
          className="btn-danger"
          onClick={async () => {
            const reason = await promptText({
              title: 'طلب حذف',
              message: labels?.reasonDelete(reference) || `سبب طلب حذف ${reference}؟ (اختياري)`,
              confirmLabel: 'متابعة',
            });
            if (reason === null) return;
            const accepted = await confirmAction({
              title: 'إرسال طلب الحذف',
              message: labels?.confirmDelete(reference) || `إرسال طلب حذف ${reference} إلى المشرف؟`,
              confirmLabel: 'إرسال',
              danger: true,
            });
            if (!accepted) return;
            try {
              await requestAuditDelete(reference, reason);
              onMessage(labels?.deleteSent(reference) || `تم إرسال طلب الحذف. العملية ${reference} بانتظار موافقة المشرف.`);
              await onChanged();
            } catch (error) {
              onMessage(masterErrorMessage(error));
            }
          }}
        >
          {labels?.deleteRequest || 'طلب حذف'}
        </button>
      ) : (
        <button type="button" className="btn-danger" onClick={onDelete}>
          {labels?.delete || 'حذف'}
        </button>
      )}
      {modal}
    </div>
  );
}
