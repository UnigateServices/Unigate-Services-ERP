export type MenuBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  up: boolean;
};

const MARGIN = 8;
const GAP = 6;

/** Keeps a floating list inside the viewport, including near the screen edges. */
export function placeFloatingMenu(anchor: DOMRect): MenuBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(anchor.width, 0), Math.max(0, vw - MARGIN * 2));
  let left = anchor.left;
  if (left < MARGIN) left = MARGIN;
  if (left + width > vw - MARGIN) left = Math.max(MARGIN, vw - MARGIN - width);

  const spaceBelow = vh - anchor.bottom - MARGIN - GAP;
  const spaceAbove = anchor.top - MARGIN - GAP;
  const up = spaceBelow < 160 && spaceAbove > spaceBelow;
  const room = Math.max(0, up ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(320, room > 0 ? room : 48);
  const top = up ? anchor.top - GAP : anchor.bottom + GAP;
  return { top, left, width, maxHeight, up };
}
