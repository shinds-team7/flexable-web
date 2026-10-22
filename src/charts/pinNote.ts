// 첫 핀 옆 손글씨 메모(.handnote). drawTimeChart가 다시 그리면 wrap을 비우므로 TimeChart의 afterDraw에서 매번 붙인다.

/** 오르는 단일 핀(없으면 아무 핀) 왼쪽 위에 메모를 붙인다. 핀이 없으면 붙이지 않는다. */
export function placePinNote(wrap: HTMLElement, text = '핀에 마우스를 올려 보세요') {
  const pin = wrap.querySelector<HTMLElement>('.pin.rise:not(.cluster)') || wrap.querySelector<HTMLElement>('.pin');
  if (!pin) return;
  const note = document.createElement('div');
  note.className = 'handnote';
  note.textContent = text;
  wrap.append(note);
  note.style.left = Math.max(0, parseFloat(pin.style.left) - note.offsetWidth - 14) + 'px';
  note.style.top = Math.max(0, parseFloat(pin.style.top) - note.offsetHeight - 6) + 'px';
}

export const removePinNote = (wrap: ParentNode = document) => wrap.querySelector('.handnote')?.remove();
