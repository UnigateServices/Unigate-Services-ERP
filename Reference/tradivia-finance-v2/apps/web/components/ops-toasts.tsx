'use client';

import { ReactNode, useRef, useState } from 'react';

type Toast = { id: number; text: string; tone: 'ok' | 'err' };

export function useOpsToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  function push(text: string, tone: 'ok' | 'err' = 'ok') {
    const id = seq.current + 1;
    seq.current = id;
    setToasts((list) => [...list, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 3200);
  }

  const node: ReactNode = (
    <div className="ops-toasts" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`ops-toast${item.tone === 'err' ? ' is-err' : ''}`} role="status">
          {item.text}
        </div>
      ))}
    </div>
  );

  return { push, node };
}
