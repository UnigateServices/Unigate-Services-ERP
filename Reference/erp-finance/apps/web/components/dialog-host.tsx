'use client';

import { FormEvent, useEffect, useState } from 'react';
import { DialogRequest, bindDialogHost, settleDialog } from '../lib/dialogs';
import { Button } from './ui/button';
import { Modal } from './ui/modal';
import { Field, Textarea } from './ui/field';

export function DialogHost() {
  const [item, setItem] = useState<DialogRequest | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    bindDialogHost((next) => {
      setText('');
      setError('');
      setItem(next);
    });
    return () => bindDialogHost(null);
  }, []);

  if (!item) return null;

  function close() {
    settleDialog(item?.mode === 'confirm' ? false : null);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!item) return;
    if (item.mode === 'confirm') {
      settleDialog(true);
      return;
    }
    const value = text.trim();
    if (item.required && !value) {
      setError('السبب مطلوب.');
      return;
    }
    settleDialog(value);
  }

  return (
    <Modal
      front
      danger={item.danger}
      title={item.title}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={close}>
            {item.cancelLabel}
          </Button>
          <Button variant={item.danger ? 'danger' : 'primary'} type="submit" form="dlg-form">
            {item.confirmLabel}
          </Button>
        </>
      }
    >
      <form id="dlg-form" className="dlg-form" onSubmit={submit}>
        <p className="dlg-message">{item.message}</p>
        {item.mode === 'prompt' ? (
          <Field label="السبب">
            <Textarea
              autoFocus
              required={item.required}
              placeholder={item.placeholder}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError('');
              }}
            />
          </Field>
        ) : null}
        {error ? <p className="dlg-error">{error}</p> : null}
      </form>
    </Modal>
  );
}
