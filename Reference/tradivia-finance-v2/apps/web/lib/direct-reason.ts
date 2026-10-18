export function promptDirectReason(action: 'تعديل' | 'حذف', reference: string) {
  const reason = window.prompt(`سبب ${action} ${reference}؟`);
  if (reason === null) return null;
  const text = reason.trim();
  if (!text) {
    window.alert('السبب مطلوب.');
    return null;
  }
  return text;
}
