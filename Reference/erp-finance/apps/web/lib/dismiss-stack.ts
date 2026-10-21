const order: Array<() => void> = [];

export function bindDismiss(close: () => void) {
  order.push(close);
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (order[order.length - 1] !== close) return;
    event.preventDefault();
    close();
  }
  window.addEventListener('keydown', onKey);
  return () => {
    const index = order.lastIndexOf(close);
    if (index >= 0) order.splice(index, 1);
    window.removeEventListener('keydown', onKey);
  };
}
