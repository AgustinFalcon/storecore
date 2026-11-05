/** Keep keyboard navigation in the active modal, including nested native dialogs. */
export function trapDemoDialogFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || !(event.currentTarget instanceof HTMLDialogElement)) return;
  const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
  const first = elements[0], last = elements.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
}
