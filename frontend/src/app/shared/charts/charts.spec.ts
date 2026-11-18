import { TestBed } from '@angular/core/testing';
import { BarList } from './bar-list';
import { ColumnChart } from './column-chart';
import { formatCount, formatMoney, formatMonth, formatPercent, niceTicks } from './format';
import { LineChart } from './line-chart';
import { SegmentedBar } from './segmented-bar';

/** Table rows as "cell cell cell" strings (cells read individually). */
function rowTexts(el: HTMLElement): string[] {
  return [...el.querySelectorAll('tbody tr')].map((r) =>
    [...r.querySelectorAll('th, td')].map((c) => c.textContent?.trim()).join(' '),
  );
}

describe('chart formatting', () => {
  it('prints full figures under 10,000 and compact above', () => {
    expect(formatCount(1284)).toBe('1,284');
    expect(formatCount(12_900)).toBe('12.9K');
    expect(formatCount(4_200_000)).toBe('4.2M');
  });

  it('formats money with the configured currency, never assuming one', () => {
    expect(formatMoney('78.25', null)).toBe('78.25');
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatMoney('10', 'NOT_A_CODE')).toBe('10.00');
  });

  it('formats percentages and months', () => {
    expect(formatPercent(33.333)).toBe('33.3%');
    expect(formatMonth('2026-11')).toBe('Nov');
    expect(formatMonth('2026-01', true)).toBe('Jan 2026');
  });

  it('produces clean integer axis ticks covering the maximum', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(47)).toEqual([0, 20, 40, 60]);
    const t = niceTicks(1234);
    expect(t[0]).toBe(0);
    expect(t.at(-1)!).toBeGreaterThanOrEqual(1234);
  });
});

describe('SegmentedBar', () => {
  it('describes every part in its accessible name and switches to a table view', async () => {
    const fixture = TestBed.createComponent(SegmentedBar);
    fixture.componentRef.setInput('ariaLabel', 'Copies by state');
    fixture.componentRef.setInput('segments', [
      { label: 'Available', value: 3, slot: 1 },
      { label: 'Issued', value: 1, slot: 2 },
      { label: 'Reserved', value: 0, slot: 3 },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Copies by state: Available 3 (75%), Issued 1 (25%), Reserved 0 (0%)',
    );
    // A zero part draws no block but stays in the legend.
    expect(el.querySelectorAll('.seg')).toHaveLength(2);
    expect(el.querySelectorAll('.viz-legend li')).toHaveLength(3);

    el.querySelector<HTMLButtonElement>('.viz-toggle')!.click();
    await fixture.whenStable();
    expect(rowTexts(el)).toEqual(['Available 3 75%', 'Issued 1 25%', 'Reserved 0 0%']);
    expect(el.querySelector('tfoot')?.textContent).toContain('4');
  });

  it('shows an empty message when there is nothing to split', async () => {
    const fixture = TestBed.createComponent(SegmentedBar);
    fixture.componentRef.setInput('ariaLabel', 'x');
    fixture.componentRef.setInput('segments', [{ label: 'A', value: 0, slot: 1 }]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No copies to show yet');
  });

  it('shows a tooltip on keyboard focus', async () => {
    const fixture = TestBed.createComponent(SegmentedBar);
    fixture.componentRef.setInput('ariaLabel', 'x');
    fixture.componentRef.setInput('segments', [{ label: 'Available', value: 5, slot: 1 }]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('.seg')!.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    expect(el.querySelector('[role="tooltip"]')?.textContent).toContain('5');
  });
});

describe('BarList', () => {
  it('scales bars to the largest value and prints every value', async () => {
    const fixture = TestBed.createComponent(BarList);
    fixture.componentRef.setInput('ariaLabel', 'Categories');
    fixture.componentRef.setInput('items', [
      { label: 'History', value: 4, detail: '2 titles' },
      { label: 'Science', value: 2 },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const widths = [...el.querySelectorAll<HTMLElement>('.bar-list__bar')].map(
      (b) => b.style.width,
    );
    expect(widths).toEqual(['100%', '50%']);
    expect([...el.querySelectorAll('.bar-list__value')].map((v) => v.textContent?.trim())).toEqual([
      '4',
      '2',
    ]);
  });
});

describe('ColumnChart', () => {
  it('draws a column per non-zero month, labels the maximum, and offers a table', async () => {
    const fixture = TestBed.createComponent(ColumnChart);
    fixture.componentRef.setInput('ariaLabel', 'Purchases');
    fixture.componentRef.setInput('detailHeaders', ['Invoices']);
    fixture.componentRef.setInput('data', [
      { month: '2026-09', value: 0, details: ['0 invoices'] },
      { month: '2026-10', value: 1, details: ['1 invoice'] },
      { month: '2026-11', value: 2, details: ['1 invoice'] },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('path.viz-column')).toHaveLength(2);
    expect(el.querySelector('.viz-cap')?.textContent?.trim()).toBe('2');

    el.querySelector<HTMLButtonElement>('.viz-toggle')!.click();
    await fixture.whenStable();
    expect(rowTexts(el)).toEqual([
      'Sep 2026 0 0 invoices',
      'Oct 2026 1 1 invoice',
      'Nov 2026 2 1 invoice',
    ]);
  });
});

describe('LineChart', () => {
  async function render() {
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('ariaLabel', 'Circulation');
    fixture.componentRef.setInput('months', ['2026-10', '2026-11']);
    fixture.componentRef.setInput('series', [
      { label: 'Issued', slot: 1, values: [3, 1] },
      { label: 'Returned', slot: 2, values: [1, 1] },
    ]);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('draws one path per series with a legend that carries totals', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('path.viz-line')).toHaveLength(2);
    const legend = [...el.querySelectorAll('.viz-legend li')].map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(legend).toEqual(['Issued 4', 'Returned 2']);
  });

  it('hides end labels that would collide instead of nudging them', async () => {
    const { el } = await render();
    // Both series end at 1 → same y → labels suppressed; legend + tooltip carry the values.
    expect(el.querySelectorAll('.viz-end-label')).toHaveLength(0);
  });

  it('lets the keyboard walk months and reads every series in the tooltip', async () => {
    const { fixture, el } = await render();
    const svg = el.querySelector('svg')!;
    svg.dispatchEvent(new FocusEvent('focus'));
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await fixture.whenStable();
    const tip = el.querySelector('[role="tooltip"]')?.textContent?.replace(/\s+/g, ' ');
    expect(tip).toContain('Oct 2026');
    expect(tip).toContain('3 Issued');
    expect(tip).toContain('1 Returned');
  });
});
