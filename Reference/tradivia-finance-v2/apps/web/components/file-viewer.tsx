'use client';

import { useEffect, useState } from 'react';
import { AttachmentFile, listAttachments, loadAttachment, openAttachment } from '../lib/api';
import { OpsDialog } from './ops-dialog';

type Props = {
  reference: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
};

function isImage(file: AttachmentFile) {
  return file.mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(file.ext.toLowerCase());
}

export function FileViewer({ reference, title, closeLabel, onClose }: Props) {
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [activeId, setActiveId] = useState('');
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    listAttachments(reference)
      .then((result) => {
        if (cancelled) return;
        setFiles(result.files);
        setActiveId(result.files[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setMessage('تعذر فتح المرفقات.');
      });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  const active = files.find((file) => file.id === activeId) || null;

  useEffect(() => {
    if (!active || !isImage(active)) {
      setPreview('');
      return;
    }
    let cancelled = false;
    let url = '';
    loadAttachment(reference, active.id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview('');
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [reference, active]);

  return (
    <OpsDialog title={title} onClose={onClose} closeLabel={closeLabel} wide>
      {message ? <p className="ops-log-empty">{message}</p> : null}
      {!message && files.length === 0 ? <p className="ops-log-empty">لا مرفقات.</p> : null}
      {files.length > 0 ? (
        <div className="ops-files">
          <div className="ops-file-list" role="tablist">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`ops-file-tab${file.id === activeId ? ' is-on' : ''}`}
                onClick={() => setActiveId(file.id)}
              >
                <strong>{file.name}</strong>
                <small>{file.ext.toUpperCase()}</small>
              </button>
            ))}
          </div>
          <div className="ops-file-stage">
            {active && isImage(active) && preview ? <img src={preview} alt={active.name} /> : null}
            {active && !isImage(active) ? (
              <div className="ops-file-fallback">
                <strong>{active.name}</strong>
                <button type="button" className="btn" onClick={() => void openAttachment(reference, active.id)}>
                  فتح الملف
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </OpsDialog>
  );
}
