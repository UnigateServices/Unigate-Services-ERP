export type DialogRequest = {
  mode: 'confirm' | 'prompt';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  required: boolean;
  placeholder: string;
  resolve: (value: boolean | string | null) => void;
};

type Listener = (item: DialogRequest | null) => void;

let listener: Listener | null = null;
let current: DialogRequest | null = null;
const queue: DialogRequest[] = [];

export function bindDialogHost(next: Listener | null) {
  listener = next;
  if (!next) return;
  next(current);
  if (!current) pump();
}

function pump() {
  if (current || !listener) return;
  const item = queue.shift();
  if (!item) {
    listener(null);
    return;
  }
  current = item;
  listener(item);
}

export function settleDialog(value: boolean | string | null) {
  const active = current;
  current = null;
  active?.resolve(value);
  pump();
}

function enqueue(item: DialogRequest) {
  queue.push(item);
  pump();
}

export function confirmAction(input: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}) {
  return new Promise<boolean>((resolve) => {
    enqueue({
      mode: 'confirm',
      title: input.title,
      message: input.message,
      confirmLabel: input.confirmLabel || 'تأكيد',
      cancelLabel: input.cancelLabel || 'إلغاء',
      danger: Boolean(input.danger),
      required: false,
      placeholder: '',
      resolve: (value) => resolve(value === true),
    });
  });
}

export function promptText(input: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return new Promise<string | null>((resolve) => {
    enqueue({
      mode: 'prompt',
      title: input.title,
      message: input.message,
      confirmLabel: input.confirmLabel || 'متابعة',
      cancelLabel: input.cancelLabel || 'إلغاء',
      danger: false,
      required: Boolean(input.required),
      placeholder: input.placeholder || '',
      resolve: (value) => resolve(typeof value === 'string' ? value : null),
    });
  });
}
