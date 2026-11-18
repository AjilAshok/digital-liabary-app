import { DestroyRef, ElementRef, WritableSignal, afterNextRender, inject } from '@angular/core';

/**
 * Keeps `width` equal to the host element's content width (CSS px), so SVG charts lay out in
 * real pixels instead of scaling text. Must be called in an injection context (constructor).
 * Falls back to the initial value where ResizeObserver is unavailable (e.g. unit-test DOMs).
 */
export function observeWidth(width: WritableSignal<number>, min = 280): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0) width.set(Math.max(min, w));
    });
    observer.observe(host);
    destroyRef.onDestroy(() => observer.disconnect());
  });
}
