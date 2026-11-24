// A single-series bar chart drawn as SVG by code: requests per workflow state.
// One accent hue (identity is carried by the axis labels, not colour), value
// labels above each bar, a focusable column per bar with a native tooltip,
// and a visually hidden table for screen readers.

import { h, s } from './dom.mjs';

const WIDTH = 520;
const HEIGHT = 240;
const PAD = { top: 28, right: 8, bottom: 34, left: 8 };

/** "nice" upper bound for the axis: 1, 2, 5, 10, 20, 50 … at or above max. */
export function niceMax(max) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Path for a bar with 4px rounded top corners and a square base. */
function barPath(x, y, width, height) {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * @param {{label: string, value: number}[]} data
 * @param {{title: string}} options
 */
export function barChart(data, { title }) {
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = innerWidth / data.length;
  const barWidth = Math.min(56, slot * 0.56);
  const baseline = PAD.top + innerHeight;

  const gridLines = [0.5, 1].map((fraction) => {
    const y = baseline - innerHeight * fraction;
    return s('line', { class: 'grid', x1: PAD.left, x2: WIDTH - PAD.right, y1: y, y2: y });
  });

  const columns = data.map((datum, index) => {
    const height = top === 0 ? 0 : (datum.value / top) * innerHeight;
    const centre = PAD.left + slot * index + slot / 2;
    const x = centre - barWidth / 2;
    const y = baseline - height;
    const description = `${datum.label}: ${datum.value}`;
    return s(
      'g',
      { class: 'col', tabindex: 0, role: 'img', 'aria-label': description },
      s('title', null, description),
      s('rect', { class: 'hit', x: centre - slot / 2 + 2, y: PAD.top - 20, width: slot - 4, height: innerHeight + 20, rx: 4 }),
      height > 0 ? s('path', { class: 'bar', d: barPath(x, y, barWidth, height) }) : null,
      s('text', { class: 'value', x: centre, y: y - 8, 'text-anchor': 'middle' }, String(datum.value)),
      s('text', { class: 'label', x: centre, y: baseline + 20, 'text-anchor': 'middle' }, datum.label),
    );
  });

  const svg = s(
    'svg',
    { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, 'aria-hidden': 'false', role: 'group', 'aria-label': title },
    gridLines,
    columns,
    s('line', { class: 'baseline', x1: PAD.left, x2: WIDTH - PAD.right, y1: baseline, y2: baseline }),
  );

  const table = h(
    'table',
    { class: 'sr-only' },
    h('caption', null, title),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'State'), h('th', { scope: 'col' }, 'Requests'))),
    h('tbody', null, data.map((d) => h('tr', null, h('th', { scope: 'row' }, d.label), h('td', null, String(d.value))))),
  );

  return h('div', { class: 'chart' }, svg, table);
}
