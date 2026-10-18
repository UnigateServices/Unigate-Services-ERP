'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AttachmentFile,
  deleteAttachment,
  listAttachments,
  openAttachment,
  uploadAttachments,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';

const MAX_FILES = 8;
const MAX_FILE_BYTES = Math.ceil(4.5 * 1024 * 1024);

type Props = {
  reference?: string | null;
  pendingFiles: File[];
  onPendingFiles: (files: File[]) => void;
  disabled?: boolean;
  hint?: string;
  pendingLabel?: string;
  removeLabel?: string;
  uploadLabel?: string;
  uploadingLabel?: string;
};

function fileSizeLabel(size: number) {
  if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(size > 1024 ? 0 : 1)} KB`;
}

export function AttachmentsBox({
  reference,
  pendingFiles,
  onPendingFiles,
  disabled,
  hint = 'اسحب الملفات هنا أو انقر للاختيار',
  pendingLabel = 'بانتظار الحفظ',
  removeLabel = 'إزالة',
  uploadLabel = 'رفع الملفات الآن',
  uploadingLabel = 'جاري الرفع...',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<AttachmentFile[]>([]);
  const [canUpload, setCanUpload] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshSaved() {
    if (!reference) {
      setSaved([]);
      setCanUpload(true);
      setCanDelete(false);
      return;
    }
    const result = await listAttachments(reference);
    setSaved(result.files);
    setCanUpload(result.canUpload);
    setCanDelete(result.canDelete);
  }

  useEffect(() => {
    let cancelled = false;
    if (!reference) {
      setSaved([]);
      setCanUpload(!disabled);
      setCanDelete(false);
      return;
    }
    listAttachments(reference)
      .then((result) => {
        if (cancelled) return;
        setSaved(result.files);
        setCanUpload(result.canUpload);
        setCanDelete(result.canDelete);
      })
      .catch((error) => {
        if (!cancelled) setMessage(masterErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reference, disabled]);

  const remaining = Math.max(0, MAX_FILES - saved.length - pendingFiles.length);
  const allowAdd = !disabled && canUpload && remaining > 0 && !busy;

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const next = pendingFiles.slice();
    let tooLarge = false;
    let tooMany = false;
    for (const file of incoming) {
      if (next.length + saved.length >= MAX_FILES) {
        tooMany = true;
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        tooLarge = true;
        continue;
      }
      const exists = next.some((row) => row.name === file.name && row.size === file.size);
      if (!exists) next.push(file);
    }
    onPendingFiles(next);
    if (tooLarge) setMessage('الملف أكبر من 4.5 ميغابايت.');
    else if (tooMany) setMessage('الحد الأقصى 8 مرفقات لكل عملية.');
    else setMessage('');
  }

  async function uploadPendingNow() {
    if (!reference || pendingFiles.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      await uploadAttachments(reference, pendingFiles);
      onPendingFiles([]);
      await refreshSaved();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveSaved(id: string) {
    if (!reference || !window.confirm('حذف هذا المرفق؟')) return;
    setBusy(true);
    setMessage('');
    try {
      await deleteAttachment(reference, id);
      await refreshSaved();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onOpen(id: string) {
    if (!reference) return;
    try {
      await openAttachment(reference, id);
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  return (
    <div className="attachments-box full">
      <div
        className={`attachments-drop${allowAdd ? '' : ' is-disabled'}`}
        role="button"
        tabIndex={allowAdd ? 0 : -1}
        onClick={() => allowAdd && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!allowAdd) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (allowAdd) addFiles(event.dataTransfer.files);
        }}
      >
        {hint}
      </div>
      <input
        ref={inputRef}
        className="attachments-native"
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,image/*,application/pdf"
        disabled={!allowAdd}
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {saved.length > 0 ? (
        <ul className="attachments-list">
          {saved.map((file) => (
            <li key={file.id}>
              <button type="button" className="btn-ghost" onClick={() => void onOpen(file.id)}>
                {file.name}
              </button>
              <span className="muted">{fileSizeLabel(file.size)}</span>
              {canDelete && !disabled ? (
                <button type="button" className="btn-danger" onClick={() => void onRemoveSaved(file.id)}>
                  حذف
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {pendingFiles.length > 0 ? (
        <ul className="attachments-list">
          {pendingFiles.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              <span>{file.name}</span>
              <span className="muted">{fileSizeLabel(file.size)} · {pendingLabel}</span>
              {!disabled ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onPendingFiles(pendingFiles.filter((_, item) => item !== index))}
                >
                  {removeLabel}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {reference && pendingFiles.length > 0 && canUpload && !disabled ? (
        <button type="button" className="nav-btn" disabled={busy} onClick={() => void uploadPendingNow()}>
          {busy ? uploadingLabel : uploadLabel}
        </button>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

type ModalProps = {
  reference: string;
  onClose: () => void;
  title?: string;
  closeLabel?: string;
  hint?: string;
  pendingLabel?: string;
  removeLabel?: string;
  uploadLabel?: string;
  uploadingLabel?: string;
};

export function AttachmentsModal({
  reference,
  onClose,
  title,
  closeLabel = 'إغلاق',
  hint,
  pendingLabel,
  removeLabel,
  uploadLabel,
  uploadingLabel,
}: ModalProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  return (
    <div className="attach-modal-backdrop" onClick={onClose}>
      <div
        className="attach-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || `مرفقات ${reference}`}
      >
        <div className="attach-modal-head">
          <strong>{title || `مرفقات ${reference}`}</strong>
          <button type="button" className="paper-x" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </div>
        <AttachmentsBox
          reference={reference}
          pendingFiles={pendingFiles}
          onPendingFiles={setPendingFiles}
          hint={hint}
          pendingLabel={pendingLabel}
          removeLabel={removeLabel}
          uploadLabel={uploadLabel}
          uploadingLabel={uploadingLabel}
        />
      </div>
    </div>
  );
}
