// Measured ladder values and published projections are loaded from paper-data.js. No browser-side fitting.
const STYLE = {
  // Paper colour code: Figure 1 agent blue / object orange; Figures 4-5 colour by
  // model family (Edge blue, Nano red, Super green, Ours teal), dashed = baseline.
  overview_agent: { color: 'var(--fig-agent)', dashed: false, label: 'Agent (hands)', family: 'nano' },
  overview_object: { color: 'var(--fig-object)', dashed: false, label: 'Object', family: 'nano' },
  nano_baseline: { color: 'var(--fig-nano)', dashed: true, label: 'Nano baseline', family: 'nano' },
  nano_skeleton: { color: 'var(--fig-nano)', dashed: false, label: 'Nano + skeleton', family: 'nano' },
  edge_baseline: { color: 'var(--fig-edge)', dashed: true, label: 'Edge baseline', family: 'edge' },
  edge_skeleton: { color: 'var(--fig-edge)', dashed: false, label: 'Edge + skeleton', family: 'edge' },
  nano_ours: { color: 'var(--fig-ours)', dashed: false, label: 'Ours', family: 'nano' },
  super_skeleton: { color: 'var(--fig-super)', dashed: false, label: 'Super + skeleton', family: 'super' },
};

const NS = "http://www.w3.org/2000/svg";
function mk(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

const plotMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const plotFrames = new WeakMap();
const plotSeen = new WeakSet();
const plotVisible = new WeakSet();
const plotPending = new WeakMap();
let plotObserver;

// A clipping window reveals the actual paths from left to right. Dashed line
// styles stay intact, and every point appears exactly as the trace reaches it.
function tracePlot(svg, keys = null, reverse = false) {
  // Figure 1 unfolds in steps (300 h -> 3k -> 30k) driven by js/teaser-scaling.js.
  if (svg.id === 'plot-overview' && !reverse && !plotMotion.matches && window.teaserStory?.start(svg)) return;
  const traces = [...svg.querySelectorAll('.trace-reveal')].filter(rect => !keys || keys.includes(rect.dataset.series));
  traces.forEach((rect, index) => {
    cancelAnimationFrame(plotFrames.get(rect));
    const width = Number(rect.dataset.width);
    if (plotMotion.matches) { rect.setAttribute('width', reverse ? 0 : width); return; }
    const duration = reverse ? 260 : (svg._plotOptions?.duration || 1600);
    const start = performance.now() + (reverse || svg.id === 'plot-overview' ? 0 : index * 100);
    rect.setAttribute('width', reverse ? width : 0);
    const frame = now => {
      const progress = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = reverse ? progress : 1 - Math.pow(1 - progress, 1.6);
      rect.setAttribute('width', width * (reverse ? 1 - eased : eased));
      if (!reverse && index === 0) svg._onTrace?.(width * eased);
      if (progress < 1) plotFrames.set(rect, requestAnimationFrame(frame));
    };
    plotFrames.set(rect, requestAnimationFrame(frame));
  });
}

function pointTooltip(svg, point, message) {
  const card = svg.closest('.plot-card');
  let tip = card.querySelector('.plot-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'plot-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    card.appendChild(tip);
  }
  const show = () => {
    tip.textContent = message;
    tip.hidden = false;
    const box = point.getBoundingClientRect();
    const parent = card.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.left - parent.left - tip.offsetWidth / 2, parent.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${box.top - parent.top - tip.offsetHeight - 12}px`;
    point.setAttribute('r', 5.5);
  };
  const hide = () => { tip.hidden = true; point.setAttribute('r', 3.8); };
  point.addEventListener('pointerenter', show);
  point.addEventListener('pointerleave', hide);
  point.addEventListener('focus', () => {
    svg.querySelectorAll('.trace-reveal').forEach(rect => { cancelAnimationFrame(plotFrames.get(rect)); rect.setAttribute('width', rect.dataset.width); });
    show();
  });
  point.addEventListener('click', show);
  point.addEventListener('blur', hide);
  point.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
}

function asymptoteTooltip(svg, hit, line, message) {
  const card = svg.closest('.plot-card');
  const tipEl = () => {
    let tip = card.querySelector('.plot-tooltip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'plot-tooltip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; card.appendChild(tip); }
    return tip;
  };
  const show = event => {
    const tip = tipEl(), parent = card.getBoundingClientRect(), box = hit.getBoundingClientRect();
    tip.textContent = message; tip.hidden = false;
    const x = (event?.clientX ?? box.left + box.width / 2) - parent.left;
    tip.style.left = `${Math.max(8, Math.min(x - tip.offsetWidth / 2, parent.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${box.top + box.height / 2 - parent.top - tip.offsetHeight - 10}px`;
    line.setAttribute('opacity', 1); line.setAttribute('stroke-width', 2.2);
  };
  const hide = () => { const tip = card.querySelector('.plot-tooltip'); if (tip) tip.hidden = true; line.setAttribute('opacity', .75); line.setAttribute('stroke-width', 1.3); };
  hit.addEventListener('pointerenter', show);
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('click', show);
}

function renderPlot(svg, opts) {
  const previous = svg._plotOptions;
  svg._plotOptions = opts;
  const sameAxis = previous && previous.showExtrap === opts.showExtrap;
  const newKeys = sameAxis ? opts.seriesKeys.filter(key => !previous.seriesKeys.includes(key)) : opts.seriesKeys;
  svg.querySelectorAll('.trace-reveal').forEach(rect => cancelAnimationFrame(plotFrames.get(rect)));
  svg.closest('.plot-card').querySelector('.plot-tooltip')?.remove();
  const W = Math.max(260, Math.round(svg.clientWidth || 540)), H = typeof opts.height === 'function' ? opts.height() : (opts.height || 320);
  const compact = W < 420;
  const pad = { l: 43, r: 19, t: opts.height ? 20 : 30, b: opts.height ? 40 : 52 };
  svg.style.aspectRatio = `${W} / ${H}`;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const xMax = opts.showExtrap ? 1000000 : 30000;
  const xMin = opts.xMin || 300;
  const xOf = hours => pad.l + iw * Math.log(hours / xMin) / Math.log(xMax / xMin);
  const yOf = value => pad.t + ih * (1 - (value - opts.yDomain[0]) / (opts.yDomain[1] - opts.yDomain[0]));
  if (opts.onReveal) {
    svg._onTrace = width => {
      const points = opts.data[opts.seriesKeys[0]].points;
      const current = points.filter(([hours]) => xOf(hours) <= pad.l - 8 + width).at(-1) || points[0];
      opts.onReveal(current[0]);
    };
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', `${opts.yLabel}. Training data from ${xMin.toLocaleString()} to ${xMax.toLocaleString()} clip-equivalent hours. Higher scores are better. Use arrow keys to inspect points.`);
  svg.innerHTML = '';
  const defs = mk('defs');
  svg.appendChild(defs);
  svg.appendChild(mk('text', { x: pad.l, y: 13, fill: 'var(--ink-dim)', 'font-size': 10, 'font-family': 'DM Sans, sans-serif' }, 'SCS ↑'));
  if (opts.showExtrap) {
    svg.appendChild(mk('rect', { x: xOf(30000), y: pad.t, width: W - pad.r - xOf(30000), height: ih, fill: 'var(--plot-projection)', rx: 2 }));
    svg.appendChild(mk('text', { x: xOf(30000) + 10, y: pad.t + 16, fill: 'var(--ink-dim)', 'font-size': 9, 'font-family': 'IBM Plex Mono, monospace' }, compact ? 'Projection' : 'FITTED PROJECTION'));
  }
  opts.yTicks.forEach((value, i) => {
    const y = yOf(value);
    svg.appendChild(mk('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: 'var(--plot-grid)', 'stroke-width': 1, 'stroke-dasharray': i ? '3 5' : 'none' }));
    svg.appendChild(mk('text', { x: pad.l - 12, y: y + 4, 'text-anchor': 'end', fill: 'var(--ink-dim)', 'font-size': 11, 'font-family': 'IBM Plex Mono, monospace' }, value.toFixed(2)));
  });
  const ticks = [300, 1000, 3000, 10000, 30000, ...(opts.showExtrap ? [100000, 1000000] : [])].filter(h => h >= xMin && (!compact || (opts.compactTicks ? opts.compactTicks.includes(h) : ![3000, 100000].includes(h))));
  const labels = { 300: '300', 1000: '1k', 3000: '3k', 10000: '10k', 30000: '30k', 100000: '100k', 1000000: '1M' };
  ticks.forEach(hours => {
    svg.appendChild(mk('text', { 'data-hours': hours, x: xOf(hours), y: H - pad.b + 23, 'text-anchor': 'middle', fill: 'var(--ink-dim)', 'font-size': 11, 'font-family': 'IBM Plex Mono, monospace' }, labels[hours]));
  });
  svg.appendChild(mk('text', { x: pad.l + iw / 2, y: H - 3, 'text-anchor': 'middle', fill: 'var(--ink-dim)', 'font-size': 10, 'font-family': 'DM Sans, sans-serif' }, 'Training data (hours, log scale)'));
  if (opts.showExtrap) svg.appendChild(mk('line', { x1: xOf(30000), x2: xOf(30000), y1: pad.t, y2: H - pad.b, stroke: 'var(--line-strong)', 'stroke-dasharray': '4 5' }));

  // Fitted asymptotes of the saturating curves, drawn as in the paper (dotted, series colour).
  opts.seriesKeys.forEach(key => {
    const a = opts.data[key]?.asymptote;
    if (a == null || a < opts.yDomain[0] || a > opts.yDomain[1]) return;
    const y = yOf(a), message = `${STYLE[key].label} · asymptote ${a.toFixed(3)} SCS`;
    const line = mk('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: STYLE[key].color, 'stroke-width': 1.3,
      'stroke-dasharray': '1.5 3.5', 'stroke-linecap': 'round', opacity: .75, class: 'plot-asymptote', 'data-series': key });
    const hit = mk('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: 'transparent', 'stroke-width': 9,
      class: 'plot-asymptote-hit', role: 'img', 'aria-label': message });
    svg.appendChild(line); svg.appendChild(hit);
    asymptoteTooltip(svg, hit, line, message);
  });
  opts.seriesKeys.forEach(key => {
    const series = opts.data[key], style = STYLE[key];
    if (!series) return;
    const clipId = `${svg.id}-${key}-clip`;
    const clip = mk('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    const reveal = mk('rect', { x: pad.l - 8, y: pad.t - 9, width: iw + 18, height: ih + 18, class: 'trace-reveal', 'data-series': key, 'data-width': iw + 18 });
    clip.appendChild(reveal); defs.appendChild(clip);
    const group = mk('g', { 'clip-path': `url(#${clipId})`, 'data-series': key });
    svg.appendChild(group);
    const toPath = points => points.map(([hours, value], i) => `${i ? 'L' : 'M'}${xOf(hours)},${yOf(value)}`).join(' ');
    const path = toPath(series.observed);
    // A very light wash anchors the leading curve without obscuring the axes.
    if (key === opts.seriesKeys[opts.seriesKeys.length - 1]) {
      const gradientId = `${svg.id}-wash`;
      const gradient = mk('linearGradient', { id: gradientId, x1: 0, x2: 0, y1: 0, y2: 1 });
      gradient.appendChild(mk('stop', { offset: '0%', 'stop-color': style.color, 'stop-opacity': .12 }));
      gradient.appendChild(mk('stop', { offset: '100%', 'stop-color': style.color, 'stop-opacity': 0 }));
      defs.appendChild(gradient);
      group.appendChild(mk('path', { d: `${path} L${xOf(30000)},${H - pad.b} L${xOf(xMin)},${H - pad.b} Z`, fill: `url(#${gradientId})`, 'aria-hidden': 'true' }));
    }
    group.appendChild(mk('path', { d: path, fill: 'none', stroke: style.color, 'stroke-width': style.family === 'edge' ? 2.1 : 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': style.dashed ? '5 5' : 'none' }));
    series.points.forEach(([hours, value]) => {
      const message = `${style.label} · ${hours.toLocaleString('en-US')} h · ${value.toFixed(3)} SCS`;
      const point = mk('circle', { 'data-hours': hours, cx: xOf(hours), cy: yOf(value), r: 3.8, fill: 'var(--bg-2)', stroke: style.color, 'stroke-width': 2, tabindex: -1, class: 'plot-point', role: 'img', 'aria-label': message });
      point.appendChild(mk('title', {}, message));
      group.appendChild(point);
      pointTooltip(svg, point, message);
    });
    if (opts.directLabels) {
      const [hours, value] = series.points.at(-1);
      group.appendChild(mk('text', {
        x: xOf(hours) - 6, y: yOf(value) + (style.dashed ? 32 : -13),
        'text-anchor': 'end', fill: style.color, 'font-size': 11, 'font-weight': 500,
        stroke: 'var(--bg-2)', 'stroke-width': 4, 'stroke-linejoin': 'round',
        'paint-order': 'stroke', class: 'plot-series-label',
      }, style.label));
    }
    if (opts.showExtrap && series.projected.length) {
      group.appendChild(mk('path', { d: toPath(series.projected), fill: 'none', stroke: style.color, 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round', opacity: .8 }));
    }
  });
  const points = [...svg.querySelectorAll('.plot-point')];
  if (points.length) points[0].setAttribute('tabindex', '0');
  svg.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const index = points.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 :
      (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + points.length) % points.length;
    points[index].setAttribute('tabindex', '-1');
    points[next].setAttribute('tabindex', '0'); points[next].focus();
  };
  opts.afterRender?.(svg, { xOf, yOf, pad, W, H, iw, ih });
  if (plotMotion.matches) { opts.onReveal?.(30000); return; }
  if (!plotSeen.has(svg)) queueTrace(svg);
  else if (newKeys.length) queueTrace(svg, newKeys);
  else if (opts.onReveal && !plotPending.has(svg)) opts.onReveal(30000);
}

function queueTrace(svg, keys = null) {
  if (plotMotion.matches) return;
  if (plotVisible.has(svg)) { tracePlot(svg, keys); return; }
  plotPending.set(svg, keys);
  svg.querySelectorAll('.trace-reveal').forEach(rect => {
    if (!keys || keys.includes(rect.dataset.series)) rect.setAttribute('width', 0);
  });
  plotObserver?.observe(svg);
}

function renderLegend(el, keys) {
  el.replaceChildren(...keys.map(key => {
    const style = STYLE[key];
    const item = document.createElement('span');
    const mark = document.createElement('i');
    mark.style.borderTop = `2px ${style.dashed ? 'dashed' : 'solid'} ${style.color}`;
    item.append(mark, document.createTextNode(style.label));
    return item;
  }));
}

const state = { skeleton: true, extrap: true };
const stateDesign = { ours: true, extrap: true };
function updateReadout(id, value, caption) {
  document.getElementById(`score-${id}`).textContent = `≈${value.toFixed(3)}`;
  document.getElementById(`trend-${id}`).textContent = caption;
}
// Figure 1 scale selection: 300 h, 3k h and 30k h are selectable. The hero
// comparison (js/teaser-scaling.js) listens for `teaser:scale` and swaps in the
// prediction trained on that much data.
const SCALE_STOPS = [300, 3000, 30000];
const SCALE_NAMES = { 300: '300', 3000: '3k', 30000: '30k' };
const scaleState = {
  selected: (typeof TEASER_SCALING !== 'undefined' && TEASER_SCALING.default) || 30000,
  revealed: 0,
};
function decorateScaleStops(svg, g) {
  scaleState.revealed = plotSeen.has(svg) && !plotPending.has(svg) ? scaleState.revealed : 0;
  const top = g.pad.t, bottom = g.H - g.pad.b;
  const layer = mk('g', { class: 'scale-stops' });
  layer.appendChild(mk('rect', { class: 'scale-band', x: 0, y: top, width: 30, height: bottom - top, rx: 6 }));
  const xs = SCALE_STOPS.map(g.xOf);
  SCALE_STOPS.forEach((hours, i) => {
    const left = i ? (xs[i - 1] + xs[i]) / 2 : g.pad.l - 14;
    const right = i < xs.length - 1 ? (xs[i] + xs[i + 1]) / 2 : g.W - g.pad.r + 10;
    const hit = mk('rect', { class: 'scale-hit', x: left, y: top - 6, width: right - left, height: bottom - top + 6, fill: 'transparent', 'data-hours': hours });
    hit.addEventListener('click', () => selectScale(hours));
    layer.appendChild(hit);
  });
  const firstSeries = svg.querySelector('g[data-series]');
  svg.insertBefore(layer, firstSeries);
  SCALE_STOPS.forEach(hours => {
    const label = svg.querySelector(`text[data-hours="${hours}"]`);
    if (!label) return;
    const name = SCALE_NAMES[hours];
    const button = mk('g', { class: 'scale-pill', role: 'button', tabindex: 0, 'data-hours': hours, 'aria-label': `Show the prediction trained on ${name} hours` });
    const box = label.getBBox();
    const w = Math.max(30, box.width + 16), h = 20;
    button.appendChild(mk('rect', { x: Number(label.getAttribute('x')) - w / 2, y: box.y + box.height / 2 - h / 2, width: w, height: h, rx: h / 2 }));
    label.replaceWith(button);
    button.appendChild(label);
    button.addEventListener('click', () => selectScale(hours));
    button.addEventListener('keydown', event => {
      const index = SCALE_STOPS.indexOf(hours);
      let next = null;
      if (event.key === 'Enter' || event.key === ' ') next = hours;
      if (event.key === 'ArrowRight') next = SCALE_STOPS[Math.min(index + 1, SCALE_STOPS.length - 1)];
      if (event.key === 'ArrowLeft') next = SCALE_STOPS[Math.max(index - 1, 0)];
      if (next == null) return;
      event.preventDefault();
      selectScale(next);
      svg.querySelector(`.scale-pill[data-hours="${next}"]`)?.focus();
    });
  });
  svg.querySelectorAll('.plot-point').forEach(point => {
    const hours = Number(point.dataset.hours);
    if (!SCALE_STOPS.includes(hours)) return;
    point.classList.add('is-selectable');
    point.addEventListener('click', () => selectScale(hours));
    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectScale(hours); }
    });
  });
  svg._scaleGeom = g;
  // A redraw during the opening story keeps the partially built plot.
  if (window.teaserStory?.isActive?.() && scaleState.revealTarget) {
    const w = revealWidthFor(svg, scaleState.revealTarget);
    svg.querySelectorAll('.trace-reveal').forEach(rect => rect.setAttribute('width', w));
    plotPending.delete(svg);
  }
  updateScaleVisuals(svg);
}
function revealScaleStops(hours) {
  scaleState.revealed = hours;
  const svg = document.getElementById('plot-overview');
  if (svg) updateScaleVisuals(svg);
}
function updateScaleVisuals(svg) {
  const g = svg._scaleGeom;
  if (!g) return;
  const hours = scaleState.selected, shown = scaleState.revealed >= hours;
  const band = svg.querySelector('.scale-band');
  band.setAttribute('x', g.xOf(hours) - 15);
  band.classList.toggle('is-visible', shown);
  svg.querySelectorAll('.scale-pill').forEach(pill => {
    const on = Number(pill.dataset.hours) === hours;
    pill.classList.toggle('is-selected', on);
    pill.setAttribute('aria-pressed', on);
  });
  svg.querySelectorAll('.plot-point').forEach(point => {
    const on = shown && Number(point.dataset.hours) === hours;
    point.setAttribute('fill', on ? point.getAttribute('stroke') : 'var(--bg-2)');
    point.classList.toggle('is-selected', on);
  });
}
function selectScale(hours, { fromStory = false } = {}) {
  if (!SCALE_STOPS.includes(hours)) return;
  const svg = document.getElementById('plot-overview');
  if (!fromStory) window.teaserStory?.cancel();
  if (svg && !fromStory) {
    // Finish the opening trace so the selection is visible immediately.
    svg.querySelectorAll('.trace-reveal').forEach(rect => { cancelAnimationFrame(plotFrames.get(rect)); rect.setAttribute('width', rect.dataset.width); });
    scaleState.revealed = 30000;
  }
  const changed = scaleState.selected !== hours;
  scaleState.selected = hours;
  if (svg) updateScaleVisuals(svg);
  // A manual click on the current scale replays its sample.
  if (changed || !fromStory) document.dispatchEvent(new CustomEvent('teaser:scale', { detail: { hours } }));
}
window.selectTeaserScale = selectScale;

// Animate the overview trace from its current extent to just past `hours`.
function revealOverviewTo(hours, duration) {
  const svg = document.getElementById('plot-overview');
  const g = svg?._scaleGeom;
  if (!g) return Promise.resolve();
  const rects = [...svg.querySelectorAll('.trace-reveal')];
  if (!rects.length) return Promise.resolve();
  rects.forEach(rect => cancelAnimationFrame(plotFrames.get(rect)));
  scaleState.revealTarget = hours;
  const from = Number(rects[0].getAttribute('width')) || 0;
  const to = revealWidthFor(svg, hours);
  if (plotMotion.matches || duration <= 0 || to <= from) {
    rects.forEach(rect => rect.setAttribute('width', Math.max(from, to)));
    svg._onTrace?.(Math.max(from, to));
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const start = performance.now();
    let done = false;
    // Always land exactly on the target, even if animation frames are paused
    // (background tab) or the plot is redrawn mid-animation.
    const settle = () => {
      if (done) return; done = true;
      const w = revealWidthFor(svg, hours);
      svg.querySelectorAll('.trace-reveal').forEach(rect => { cancelAnimationFrame(plotFrames.get(rect)); rect.setAttribute('width', w); });
      svg._onTrace?.(w);
      resolve();
    };
    const frame = now => {
      if (done) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const width = from + (to - from) * eased;
      svg.querySelectorAll('.trace-reveal').forEach(rect => rect.setAttribute('width', width));
      svg._onTrace?.(width);
      if (t < 1) plotFrames.set(rects[0], requestAnimationFrame(frame));
      else settle();
    };
    plotFrames.set(rects[0], requestAnimationFrame(frame));
    setTimeout(settle, duration + 300);
  });
}
// Reveal width that just includes the marker at `hours` (taken from the drawn marker).
function revealWidthFor(svg, hours) {
  const g = svg._scaleGeom, rect = svg.querySelector('.trace-reveal');
  const full = Number(rect?.dataset.width || 0);
  if (!g || hours >= 30000) return full;
  const point = svg.querySelector(`.plot-point[data-hours="${hours}"]`);
  const x = point ? Number(point.getAttribute('cx')) : g.xOf(hours);
  return Math.min(full, x - (g.pad.l - 8) + 10);
}
function finishOverviewTrace() {
  const svg = document.getElementById('plot-overview');
  if (!svg) return;
  svg.querySelectorAll('.trace-reveal').forEach(rect => { cancelAnimationFrame(plotFrames.get(rect)); rect.setAttribute('width', rect.dataset.width); });
  svg._onTrace?.(Number(svg.querySelector('.trace-reveal')?.dataset.width || 0));
}
window.teaserPlot = { revealTo: revealOverviewTo, finish: finishOverviewTrace, select: selectScale, stops: SCALE_STOPS };

// Figure 1: on desktop the plot card matches the height of the GT/prediction column.
function overviewHeight() {
  if (window.innerWidth <= 760) return 280;
  const svg = document.getElementById('plot-overview');
  const card = svg?.closest('.plot-card'), sample = document.getElementById('hero-comparison');
  if (!card || !sample || !sample.offsetHeight) return 360;
  const overhead = card.offsetHeight - svg.getBoundingClientRect().height;
  return Math.round(Math.max(300, Math.min(560, sample.offsetHeight - overhead)));
}
function renderOverview() {
  renderPlot(document.getElementById('plot-overview'), {
    yDomain: [.3, .85], yTicks: [.3, .4, .5, .6, .7, .8],
    yLabel: 'Agent (hands) and object fidelity · Nano baseline',
    seriesKeys: ['overview_agent', 'overview_object'], data: PAPER_PLOTS.overview,
    showExtrap: false, directLabels: true, exact: true,
    afterRender: decorateScaleStops, onReveal: revealScaleStops, compactTicks: SCALE_STOPS,
    duration: 3600, height: overviewHeight,
  });
}

function renderFindings() {
  const keys = state.skeleton
    ? ['edge_baseline', 'nano_baseline', 'edge_skeleton', 'nano_skeleton', 'super_skeleton']
    : ['edge_baseline', 'nano_baseline'];
  ['hand', 'object'].forEach(category => {
    renderPlot(document.getElementById(`plot-${category}`), {
      yDomain: [.3, .85], yTicks: [.3, .4, .5, .6, .7, .8], yLabel: `${category === 'hand' ? 'Hand' : 'Object'} fidelity`,
      seriesKeys: keys, data: PAPER_PLOTS[category],
      showExtrap: state.extrap,
    });
    renderLegend(document.getElementById(`legend-${category}`), keys);
    const series = PAPER_PLOTS[category][state.skeleton ? 'nano_skeleton' : 'nano_baseline'];
    updateReadout(category, series.points.at(-1)[1], 'Nano · 30k hours');
  });
  document.getElementById('callout-hand').innerHTML = state.skeleton
      ? `<b>Conditioning changes when the agent’s limit is reached, not what it is.</b> With 300 hours, the skeleton-conditioned Nano variant reaches agent fidelity the baseline attains only at roughly 15k hours—a ~50× reduction in data. The two designs converge to about 0.01 SCS of one another (0.811 and 0.800).`
      : `The Nano curve gains 0.12 SCS between 300 and 3k hours but only 0.06 between 3k and 30k hours. Its fitted asymptote is 0.811.`;
  document.getElementById('callout-object').innerHTML = state.skeleton
      ? `The fitted object asymptote is <b>0.565</b>, of which the model has already realized <b>93%</b> at 30k hours.`
      : `Without skeleton conditioning, the object curves show no visible curvature over this range, so their asymptotes are not yet constrained.`;
}
function renderDesign() {
  const keys = stateDesign.ours ? ['nano_skeleton', 'nano_ours'] : ['nano_skeleton'];
  renderPlot(document.getElementById('plot-object-ours'), {
    xMin: 1000, yDomain: [.4, .7], yTicks: [.4, .5, .6, .7], yLabel: 'Object fidelity', seriesKeys: keys,
    data: PAPER_PLOTS.design, showExtrap: stateDesign.extrap,
  });
  renderLegend(document.getElementById('legend-ours'), keys);
  updateReadout('ours', PAPER_PLOTS.design[stateDesign.ours ? 'nano_ours' : 'nano_skeleton'].points.at(-1)[1], 'Nano · 30k hours');
  document.getElementById('callout-ours').innerHTML = stateDesign.ours
      ? `Ours exceeds the skeleton baseline at every budget, reaching <b>0.546 against 0.527 at 30k hours</b> (an improvement of 3.7%). The gain is roughly constant across the ladder—the ceiling is raised, not the rate at which it is approached.`
      : `Skeleton conditioning reaches the agent’s limit with far less data, while object fidelity converges far below.`;
}

function bindLayer(id, target, key, render, labels, affected) {
  const button = document.getElementById(id);
  button.classList.toggle('active', target[key]);
  button.setAttribute('aria-pressed', String(target[key]));
  button.querySelector('.layer-icon').textContent = target[key] ? '−' : '+';
  button.querySelector('.layer-label').textContent = labels[target[key] ? 1 : 0];
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const adding = !target[key];
    target[key] = adding;
    button.setAttribute('aria-pressed', String(adding));
    button.classList.toggle('active', adding);
    button.querySelector('.layer-icon').textContent = adding ? '−' : '+';
    button.querySelector('.layer-label').textContent = labels[adding ? 1 : 0];
    if (!adding && !plotMotion.matches) {
      button.disabled = true;
      affected.forEach(({ id: plotId, keys }) => tracePlot(document.getElementById(plotId), keys, true));
      await new Promise(resolve => setTimeout(resolve, 280));
      button.disabled = false;
    }
    render();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  if ('IntersectionObserver' in window) {
    plotObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          plotVisible.add(entry.target);
          if (!plotSeen.has(entry.target) || plotPending.has(entry.target)) {
            tracePlot(entry.target, plotPending.get(entry.target));
            plotPending.delete(entry.target);
          }
          plotSeen.add(entry.target);
        } else plotVisible.delete(entry.target);
      });
    }, { threshold: .3 });
  } else document.querySelectorAll('.plot-card svg').forEach(svg => { plotSeen.add(svg); plotVisible.add(svg); });
  renderOverview();
  renderFindings();
  renderDesign();
  const findings = ['plot-hand', 'plot-object'];
  bindLayer('tog-skeleton', state, 'skeleton', renderFindings,
    ['Add skeleton conditioning', 'Remove skeleton conditioning'],
    findings.map(id => ({ id, keys: ['nano_skeleton', 'edge_skeleton', 'super_skeleton'] })));
  bindLayer('tog-extrap', state, 'extrap', renderFindings,
    ['Extend to 1M hours', 'Remove 1M-hour projection'], findings.map(id => ({ id, keys: null })));
  bindLayer('tog-ours', stateDesign, 'ours', renderDesign,
    ['Add dynamic-region supervision', 'Remove dynamic-region supervision'], [{ id: 'plot-object-ours', keys: ['nano_ours'] }]);
  bindLayer('tog-extrap-obj', stateDesign, 'extrap', renderDesign,
    ['Extend to 1M hours', 'Remove 1M-hour projection'], [{ id: 'plot-object-ours', keys: null }]);
  document.querySelectorAll('[data-replay-plots]').forEach(button => button.addEventListener('click', () => {
    const ids = button.dataset.replayPlots === 'overview' ? ['plot-overview'] : button.dataset.replayPlots === 'findings' ? findings : ['plot-object-ours'];
    ids.forEach(id => queueTrace(document.getElementById(id)));
    document.getElementById(ids[0]).scrollIntoView({ block: 'center', behavior: plotMotion.matches ? 'instant' : 'smooth' });
  }));
  window.addEventListener('resize', () => {
    ['plot-overview'].forEach(id => {
      const svg = document.getElementById(id);
      if (svg._plotOptions && svg.viewBox.baseVal.height !== svg._plotOptions.height()) renderPlot(svg, svg._plotOptions);
    });
  });
  if ('ResizeObserver' in window) {
    const widths = new WeakMap();
    const resizer = new ResizeObserver(entries => entries.forEach(({ target }) => {
      const width = Math.round(target.clientWidth);
      if (widths.get(target) === width) return;
      widths.set(target, width);
      if (target._plotOptions) renderPlot(target, target._plotOptions);
    }));
    document.querySelectorAll('.plot-card > svg').forEach(svg => { widths.set(svg, Math.round(svg.clientWidth)); resizer.observe(svg); });
    const sample = document.getElementById('hero-comparison');
    if (sample) new ResizeObserver(() => {
      const svg = document.getElementById('plot-overview');
      if (svg?._plotOptions && svg.viewBox.baseVal.height !== overviewHeight()) renderPlot(svg, svg._plotOptions);
    }).observe(sample);
  }
  plotMotion.addEventListener('change', () => {
    if (plotMotion.matches) document.querySelectorAll('.trace-reveal').forEach(rect => {
      cancelAnimationFrame(plotFrames.get(rect));
      rect.setAttribute('width', rect.dataset.width);
      rect.closest('svg')._onTrace?.(Number(rect.dataset.width));
    });
  });
});
