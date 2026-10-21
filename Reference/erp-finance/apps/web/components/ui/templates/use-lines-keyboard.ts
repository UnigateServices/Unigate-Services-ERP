'use client';

import { KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';

/**
 * Keyboard flow for document line tables: Enter walks quantity → price → discount
 * (inputs with class `is-amount`), then jumps to the next row's item combobox, and on
 * the last row calls `addLine`. Also returns `focusLastItem` for use after adding a row.
 */
export function useLinesKeyboard(addLine: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  function focusLastItem() {
    requestAnimationFrame(() => {
      const rows = ref.current?.querySelectorAll('tbody tr');
      rows?.[rows.length - 1]?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
    });
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('is-amount')) return;
    event.preventDefault();
    const row = target.closest('tr');
    if (!row) return;
    const amounts = Array.from(row.querySelectorAll<HTMLInputElement>('input.is-amount'));
    const at = amounts.indexOf(target);
    if (at >= 0 && at < amounts.length - 1) {
      amounts[at + 1].focus();
      amounts[at + 1].select();
      return;
    }
    const next = row.nextElementSibling;
    if (next) next.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
    else {
      addLine();
      focusLastItem();
    }
  }

  return { ref, onKeyDown, focusLastItem };
}
