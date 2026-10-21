import { promptText } from './dialogs';

export function promptDirectReason(action: 'تعديل' | 'حذف', reference: string) {
  return promptText({
    title: `سبب ${action}`,
    message: `سبب ${action} ${reference}؟`,
    required: true,
    confirmLabel: 'متابعة',
  });
}
