'use strict';
/* Data page of the areal-confinement paper. Reads data/site.json (all runs, laws, NN curves) and
   data/configurations/<name>.json (one configuration in full). No dependencies. */

const RHO = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
const FIBERS = ['E-glass', 'carbon'];
const MATRIX_NAME = { ogden: 'Ogden', neo_hooke: 'Neo-Hooke' };
const CK = ['C11', 'C22', 'C12', 'C23', 'C44', 'C66'];           // order of the summary vector C
const CH = { C11: 'C<sub>11</sub>', C22: 'C<sub>22</sub>', C12: 'C<sub>12</sub>', C23: 'C<sub>23</sub>', C44: 'C<sub>44</sub>', C66: 'C<sub>66</sub>' };
const PH = { lambda: '&lambda;', mu_L: '&mu;<sub>L</sub>', mu_T: '&mu;<sub>T</sub>', beta: '&beta;', gamma: '&gamma;', alpha: '&alpha;' };
const PT = { lambda: 'λ', mu_L: 'μL', mu_T: 'μT', beta: 'β', gamma: 'γ', alpha: 'α' };
const TESTS = [
  { key: 'axial_ut', name: 'Axial tension', sym: 'ε̄₁₁', col: 1, text: 'Uniaxial strain along the fiber. Gives the first column of C: C11 and C12 = C13.' },
  { key: 'transverse_axial_ut', name: 'Transverse tension', sym: 'ε̄₂₂', col: 2, text: 'Uniaxial strain across the fiber. Gives C22 and C23.' },
  { key: 'transverse_axial_33', name: 'Transverse tension', sym: 'ε̄₃₃', col: 3, text: 'Uniaxial strain in the other transverse direction; checks C33 = C22 for transverse isotropy.' },
  { key: 'transverse_longitudinal_shear', name: 'Transverse shear', sym: '2ε̄₂₃', col: 4, text: 'Pure shear in the plane of isotropy. Gives C44 = μT.' },
  { key: 'longitudinal_shear_13', name: 'Longitudinal shear', sym: '2ε̄₁₃', col: 5, text: 'Simple shear along the fiber. Gives C55, which must equal C66.' },
  { key: 'longitudinal_shear', name: 'Longitudinal shear', sym: '2ε̄₁₂', col: 6, text: 'Simple shear along the fiber. Gives C66 = μL.' },
];

const XL = 'fiber volume fraction ρ<tspan baseline-shift="sub" font-size="8">f</tspan>';
const state = { i: 8, fiber: 'carbon', matrix: 'ogden', study: 'main', sort: null, test: 0, logy: true };
let SITE = null;
const $ = (s, el = document) => el.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fcol = (f) => css(f === 'E-glass' ? '--glass' : '--carbon');
const rho = () => RHO[state.i];
const near = (a, b) => Math.abs(a - b) < 1e-9;

function fmt(v, n = 4) {
  if (v == null || !isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    const [m, e] = v.toExponential(n - 1).split('e');
    return `${m}×10<sup>${(+e).toString().replace('-', '−')}</sup>`;
  }
  const d = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
  return v.toFixed(d).replace('-', '−');
}
const fmtTxt = (v, n = 4) => fmt(v, n).replace(/<sup>(.*?)<\/sup>/, 'e$1').replace('×10', '×10^');
const pct = (v, n = 3) => (v == null ? '–' : fmt(100 * v, n) + ' %');

/* ---------- hexagonal cell ---------- */
function hexPts(cx, cy, R = 1) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k;
    return `${(cx + R * Math.cos(a)).toFixed(4)},${(cy + R * Math.sin(a)).toFixed(4)}`;
  }).join(' ');
}
function fiberR(r) { return Math.sqrt((r * 3 * Math.sqrt(3)) / (2 * Math.PI)); }
function drawCell() {
  const svg = $('#cell');
  const r = fiberR(rho());
  const col = fcol(state.fiber);
  if (!svg.dataset.ready) {
    const ns = 'http://www.w3.org/2000/svg';
    let h = '';
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (Math.PI / 3) * k, cx = Math.sqrt(3) * Math.cos(a), cy = Math.sqrt(3) * Math.sin(a);
      h += `<polygon class="tile" points="${hexPts(cx, cy)}"/><circle class="fiber tile-fiber" cx="${cx}" cy="${cy}" r="${r}"/>`;
    }
    h += `<polygon class="main" points="${hexPts(0, 0)}"/><circle id="fiber" class="fiber" cx="0" cy="0" r="${r}"/>`;
    h += `<line class="dim" x1="-1" y1="1.12" x2="-0.5" y2="1.12"/><text x="-0.75" y="1.25" text-anchor="middle">s</text>`;
    svg.innerHTML = h;
    svg.dataset.ready = 1;
    void ns;
  }
  // no transition on r: it stalled in Chrome and left the drawn fiber at an old fraction
  svg.querySelectorAll('.fiber').forEach((c) => { c.setAttribute('r', r); c.style.r = `${r}px`; c.style.fill = col; });
}

/* ---------- charts ---------- */
const W = 320, H = 214, M = { l: 50, r: 12, t: 10, b: 36 };
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || Math.abs(hi) || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const t = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return t;
}
function tickTxt(v) {
  const a = Math.abs(v);
  if (v === 0) return '0';
  if (a >= 1e4 || a < 1e-3) {
    const e = Math.round(Math.log10(a));
    if (Math.abs(a - 10 ** e) / a < 1e-6) return `10^${e}`;
    return a >= 1e4 ? Math.round(v).toLocaleString('en').replace(/,/g, ' ') : v.toExponential(0).replace('e-', 'e−');
  }
  return String(+v.toPrecision(4)).replace('-', '−');
}
function supTick(s) {
  const m = /^10\^(-?\d+)$/.exec(s);
  return m ? `10<tspan dy="-5" font-size="8">${m[1].replace('-', '−')}</tspan>` : s;
}

function chart(el, o) {
  const pts = o.series.flatMap((s) => s.pts.filter((p) => isFinite(p[1]) && (!o.ylog || p[1] > 0) && (!o.xlog || p[0] > 0)));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let [x0, x1] = o.xrange || [Math.min(...xs), Math.max(...xs)];
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (o.yzero && !o.ylog) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
  const tx = o.xlog ? (v) => Math.log10(v) : (v) => v, ty = o.ylog ? (v) => Math.log10(v) : (v) => v;
  let X0 = tx(x0), X1 = tx(x1), Y0 = ty(y0), Y1 = ty(y1);
  if (o.ylog) { Y0 = Math.floor(Y0 * 2) / 2; Y1 = Math.ceil(Y1 * 2) / 2; if (Y1 - Y0 < 1) { Y0 -= 0.5; Y1 += 0.5; } }
  else { const pad = (Y1 - Y0 || Math.abs(Y1) || 1) * 0.06; Y0 -= pad; Y1 += pad; if (o.yfrom0 && y0 >= 0) Y0 = 0; }
  if (!o.xlog) { const pad = (X1 - X0) * 0.03; X0 -= pad; X1 += pad; }
  const px = (v) => M.l + ((tx(v) - X0) / (X1 - X0)) * (W - M.l - M.r);
  const py = (v) => H - M.b - ((ty(v) - Y0) / (Y1 - Y0)) * (H - M.t - M.b);
  let yt = o.ylog ? Array.from({ length: Math.floor(Y1) - Math.ceil(Y0) + 1 }, (_, k) => 10 ** (Math.ceil(Y0) + k))
    : niceTicks(Y0, Y1, 4);
  if (o.ylog && Y1 - Y0 < 2.2) {
    yt = [];
    for (let e = Math.floor(Y0); e <= Math.ceil(Y1); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (Math.log10(v) >= Y0 && Math.log10(v) <= Y1) yt.push(v); }
  }
  const xt = o.xticks || (o.xlog ? Array.from({ length: Math.floor(X1) - Math.ceil(X0) + 1 }, (_, k) => 10 ** (Math.ceil(X0) + k)) : niceTicks(X0, X1, 5));
  let g = '';
  if (o.shadeFrom != null) g += `<rect class="shade" x="${px(o.shadeFrom)}" y="${M.t}" width="${W - M.r - px(o.shadeFrom)}" height="${H - M.t - M.b}"/>`;
  for (const v of yt) g += `<line class="gridline" x1="${M.l}" x2="${W - M.r}" y1="${py(v)}" y2="${py(v)}"/><text class="tick" x="${M.l - 6}" y="${py(v) + 3.5}" text-anchor="end">${supTick(tickTxt(v))}</text>`;
  for (const v of xt) g += `<text class="tick" x="${px(v)}" y="${H - M.b + 15}" text-anchor="middle">${supTick(tickTxt(v))}</text>`;
  if (!o.ylog && Y0 < 0 && Y1 > 0) g += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${py(0)}" y2="${py(0)}" stroke="currentColor" opacity=".5"/>`;
  g += `<g class="axis"><line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/><line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/></g>`;
  g += `<text class="alabel" x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle">${o.xlabel || ''}</text>`;
  if (o.ylabel) g += `<text class="alabel" transform="translate(11 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${o.ylabel}</text>`;
  if (o.mark != null) g += `<line class="mark" x1="${px(o.mark)}" x2="${px(o.mark)}" y1="${M.t}" y2="${H - M.b}"/>`;
  if (o.cursor != null) g += `<line class="cursor" x1="${px(o.cursor)}" x2="${px(o.cursor)}" y1="${M.t}" y2="${H - M.b}"/>`;
  const hits = [];
  for (const s of o.series) {
    const ok = s.pts.filter((p) => isFinite(p[1]) && (!o.ylog || p[1] > 0) && (!o.xlog || p[0] > 0));
    if (s.line !== false && ok.length > 1)
      g += `<path class="series" d="${ok.map((p, k) => `${k ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join('')}" stroke="${s.color}" ${s.dash ? 'stroke-dasharray="5 3"' : ''} opacity="${s.opacity ?? 1}" stroke-width="${s.width ?? 1.8}"/>`;
    for (const p of ok) {
      if (s.dots) {
        const sel = s.sel && s.sel(p);
        g += `<circle class="dot${sel ? ' sel' : ''}" cx="${px(p[0])}" cy="${py(p[1])}" r="${sel ? 4.6 : 3.2}" fill="${s.color}" opacity="${s.opacity ?? 1}"/>`;
      }
      hits.push({ x: px(p[0]), y: py(p[1]), p, s });
    }
  }
  const legend = o.legend === false ? '' : `<div class="legend">${o.series.filter((s) => s.label).map((s) =>
    `<span><i class="${s.dots && s.line === false ? 'dotkey' : ''}${s.dash ? ' dash' : ''}" style="${s.dots && s.line === false ? 'background' : 'border-color'}:${s.color};opacity:${s.opacity ?? 1}"></i>${s.label}</span>`).join('')}</div>`;
  el.innerHTML = `<h4>${o.title}${o.sub ? `<small>${o.sub}</small>` : ''}</h4><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria || ''}">${g}</svg>${legend}`;
  const svg = el.querySelector('svg');
  const pick = (ev) => {
    const b = svg.getBoundingClientRect(), sx = ((ev.clientX - b.left) / b.width) * W, sy = ((ev.clientY - b.top) / b.height) * H;
    let best = null, bd = 18;
    for (const h of hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d < bd) { bd = d; best = h; } }
    return best;
  };
  svg.addEventListener('mousemove', (ev) => {
    const h = pick(ev);
    if (!h) return hideTip();
    showTip(ev, `${h.s.tip || h.s.label || ''}<br>${o.xname || 'x'} = ${fmt(h.p[0], 3)}<br>${o.yname || 'y'} = ${o.yfmt ? o.yfmt(h.p[1]) : fmt(h.p[1], 5)}`);
  });
  svg.addEventListener('mouseleave', hideTip);
  svg.addEventListener('click', (ev) => { const h = pick(ev); if (h && h.p[2] && o.onPick) o.onPick(h.p[2]); });
}
function showTip(ev, html) {
  const t = $('#tip');
  t.innerHTML = html; t.hidden = false;
  const x = Math.min(ev.clientX + 14, innerWidth - t.offsetWidth - 8), y = Math.min(ev.clientY + 14, innerHeight - t.offsetHeight - 8);
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
function hideTip() { $('#tip').hidden = true; }

/* ---------- data access ---------- */
const cases = (fiber, matrix = state.matrix) => SITE.cases.filter((c) => c.fiber === fiber && c.matrix === matrix).sort((a, b) => a.rho - b.rho);
const current = () => SITE.cases.find((c) => c.fiber === state.fiber && c.matrix === state.matrix && near(c.rho, rho()));
const law = (fiber, matrix = state.matrix) => SITE.laws.find((l) => l.fiber === fiber && l.matrix === matrix);
const pickCase = (c) => { state.fiber = c.fiber; state.matrix = c.matrix; state.i = RHO.findIndex((r) => near(r, c.rho)); update(); };
const isSel = (c) => (p) => p[2] && p[2].fiber === state.fiber && near(p[2].rho, rho());

/* ---------- sections ---------- */
/* largest deviation from FE over the fractions and fibers, closed form alone and with the NN correction */
function hybridGain() {
  const mx = (p, kind) => Math.max(...SITE.nn[p].filter((s) => s.kind === kind).flatMap((s) => s.points.map((q) => Math.abs(q[1]))));
  return ['mu_T', 'mu_L', 'gamma'].map((p) => ({ p, cf: mx(p, 'cf'), nn: mx(p, 'nn') }));
}
function renderGain() {
  $('#hybrid-gain').innerHTML = hybridGain().map((g) => `<div><dt>Largest deviation of ${PH[g.p]}</dt>
    <dd>${fmt(g.cf, 2)}&nbsp;% <span class="to">&rarr;</span> ${fmt(g.nn, 2)}&nbsp;%<small>closed form &rarr; hybrid</small></dd></div>`).join('');
}

function renderLedger() {
  const n = SITE.cases.length, nm = SITE.mesh.length;
  const eti = Math.max(...SITE.cases.map((c) => c.checks.e_TI));
  const g = hybridGain().find((x) => x.p === 'mu_T');
  const steps = [
    ['model', 'Cell and virtual tests', '6 tests', 'One strain state each; every test gives one column of C'],
    ['design', 'Study design', `${n} configurations`, '15 fiber fractions &times; 2 fibers &times; 2 matrices'],
    ['mesh', 'Mesh check', '<i>h</i> = <i>s</i>/50', `Within 0.17&nbsp;% of the finest of ${nm / 3} meshes, <i>s</i>/100`],
    ['stiffness', 'Effective stiffness', `e<sub>TI</sub> &le; ${pct(eti, 2)}`, 'Every C is transversely isotropic'],
    ['parameters', 'Identification', '5 parameters', '&lambda;, &mu;<sub>T</sub>, &mu;<sub>L</sub>, &gamma;, &beta; read directly off C'],
    ['hybrid', 'Closed form and hybrid', `${fmt(g.cf, 2)}&nbsp;% <span class="to">&rarr;</span> ${fmt(g.nn, 2)}&nbsp;%`,
      'Largest deviation of &mu;<sub>T</sub> from FE: closed form alone, then with the <b>neural-network correction</b>'],
  ];
  $('#flow').innerHTML = steps.map(([id, t, k, d], i) => `<li><a href="#${id}"><span class="fn">${i + 1}</span><span class="ft">${t}</span><span class="fk">${k}</span><span class="fd">${d}</span></a></li>`).join('');
}

function renderTests() {
  $('#test-tabs').innerHTML = TESTS.map((t, k) =>
    `<button type="button" role="tab" id="tab-${k}" aria-selected="${k === state.test}" tabindex="${k === state.test ? 0 : -1}"><b>${t.sym}</b><span>${t.name}</span></button>`).join('');
  const t = TESTS[state.test];
  $('#test-view').setAttribute('aria-labelledby', `tab-${state.test}`);
  $('#test-view').innerHTML = `<img src="img/fig_mises_${t.key}.png" alt="von Mises stress for the ${t.name.toLowerCase()} test ${t.sym}">
    <figcaption><b>${t.name} ${t.sym}.</b> ${t.text} von Mises stress (MPa) in the matrix, carbon fiber in the Ogden matrix at ρ<sub>f</sub> = 0.5,
    on the undeformed cell; each test has its own color scale.</figcaption>`;
  $('#test-tabs').querySelectorAll('button').forEach((b, k) => {
    b.onclick = () => { state.test = k; renderTests(); $(`#tab-${k}`).focus(); };
    b.onkeydown = (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); state.test = (state.test + d + 6) % 6; renderTests(); $(`#tab-${state.test}`).focus(); }
    };
  });
}

function renderMesh() {
  const box = $('#mesh-charts');
  const groups = [0.05, 0.4, 0.7].map((r) => SITE.mesh.filter((c) => near(c.rho, r)).sort((a, b) => b.seed - a.seed));
  const q = ['C11', 'C12', 'C23', 'C44', 'C66'].map((k) => [k, (c) => c.C[CK.indexOf(k)]]);   // the identified components, as in the paper
  box.innerHTML = q.map(() => '<div class="chart"></div>').join('');
  const col = css('--carbon');
  q.forEach(([k, f], n) => {
    chart(box.children[n], {
      title: `Change of ${CH[k]}`, xlog: true, yzero: true, yfrom0: true, xticks: [12.5, 25, 50, 100], xrange: [10, 125],
      xlabel: 'elements per cell edge  s / h', ylabel: 'change [%]', xname: 's/h', yname: 'change', yfmt: (v) => fmt(v, 3) + ' %',
      mark: 50, shadeFrom: 50,
      series: groups.map((g, j) => {
        const ref = f(g[g.length - 1]);
        const selRow = near(g[0].rho, rho());
        return {
          label: `ρ<sub>f</sub> = ${g[0].rho}`, tip: `carbon, Ogden, ρf = ${g[0].rho}`, color: col, opacity: [0.35, 0.65, 1][j], width: selRow ? 3 : 1.6, dots: true,
          pts: g.map((c) => [0.05 / c.seed, 100 * Math.abs(f(c) / ref - 1), c]),
        };
      }),
      onPick: (c) => openRun(c.id),
    });
  });
}

function renderStiffness() {
  const box = $('#stiff-charts');
  box.innerHTML = CK.map(() => '<div class="chart"></div>').join('');
  const order = [0, 1, 2, 3, 4, 5];
  order.forEach((k, n) => {
    chart(box.children[n], {
      title: CH[CK[k]], sub: 'MPa', ylog: state.logy, xlabel: XL, xname: 'ρf', yname: CK[k], cursor: rho(),
      series: FIBERS.map((f) => ({ label: f, color: fcol(f), dots: true, sel: isSel(), pts: cases(f).map((c) => [c.rho, c.C[k], c]) })),
      onPick: pickCase,
    });
  });
}

function renderResiduals() {
  const R = [['e_TI', 'e<sub>TI</sub>'], ['e_c', 'e<sub>c</sub>'], ['e_s', 'e<sub>s</sub>'], ['C13_C12', '|C<sub>13</sub>/C<sub>12</sub>&nbsp;&minus;&nbsp;1|'],
    ['C33_C22', '|C<sub>33</sub>/C<sub>22</sub>&nbsp;&minus;&nbsp;1|'], ['C55_C66', '|C<sub>55</sub>/C<sub>66</sub>&nbsp;&minus;&nbsp;1|']];
  const rows = ['ogden', 'neo_hooke'].flatMap((m) => FIBERS.map((f) => [f, m]));
  const v = (k, x) => (k === 'e_TI' ? pct(x, 2) : fmt(x, 2));
  $('#resid-table').innerHTML = `<thead><tr><th class="l">Constituents</th>${R.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(([f, m]) =>
    `<tr><th class="l" scope="row">${MATRIX_NAME[m]}, ${f}</th>${R.map(([k]) => `<td>${v(k, Math.max(...cases(f, m).map((c) => c.checks[k])))}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

const PARAMS = ['lambda', 'mu_L', 'mu_T', 'beta', 'gamma'];
function renderParams() {
  const box = $('#param-charts');
  box.innerHTML = PARAMS.map(() => '<div class="chart"></div>').join('');
  PARAMS.forEach((p, n) => {
    const series = [];
    for (const f of FIBERS) {
      const l = law(f);
      if (l) series.push({ label: `${f}, closed form`, color: fcol(f), opacity: 0.55, pts: l.curve.vf.map((v, k) => [v, l.curve[p][k]]) });
      series.push({ label: `${f}, FE`, color: fcol(f), dots: true, line: false, sel: isSel(), pts: cases(f).map((c) => [c.rho, c.proposed[p], c]) });
    }
    chart(box.children[n], {
      title: PH[p], sub: 'MPa', xlabel: XL, xname: 'ρf', yname: PT[p], cursor: rho(), series, onPick: pickCase,
      ylog: p !== 'beta' && p !== 'gamma' && p !== 'lambda',
    });
  });
}

function renderDeviation() {
  const box = $('#dev-charts');
  box.innerHTML = PARAMS.map(() => '<div class="chart"></div>').join('');
  PARAMS.forEach((p, n) => {
    const series = [];
    for (const f of FIBERS) {
      const l = law(f), cs = cases(f);
      const pts = l.rows.filter((w) => w.vf > 0).map((w) => {
        const c = cs.find((x) => near(x.rho, w.vf));
        return [w.vf, 100 * (w.predicted[p] / c.proposed[p] - 1), c];
      });
      series.push({ label: `${f}, closed form`, color: fcol(f), dash: true, dots: true, sel: isSel(), pts });
      const nnKey = p === 'gamma' ? 'gamma' : p;
      const nn = (SITE.nn[nnKey] || []).find((s) => s.fiber === f && s.kind === 'nn');
      if (nn) {
        series.push({
          label: `${f}, hybrid`, tip: `${f}, closed form + NN`, color: fcol(f), dots: false,
          pts: nn.points.map(([r, v]) => [r, v, cs.find((x) => near(x.rho, r))]),
        });
      }
    }
    chart(box.children[n], {
      title: `Deviation of ${PH[p]}`, sub: '%', xlabel: XL, xname: 'ρf', yname: 'deviation', yzero: true,
      yfmt: (v) => fmt(v, 3) + ' %', cursor: rho(), series, onPick: pickCase,
    });
  });
}

function renderReadout() {
  const c = current();
  const rows = c ? [
    ['C<sub>11</sub>', c.C[0]], ['C<sub>22</sub>', c.C[1]], ['C<sub>44</sub>', c.C[4]], ['C<sub>66</sub>', c.C[5]], null,
    ...['lambda', 'mu_T', 'mu_L', 'gamma', 'beta'].map((p) => [PH[p], c.proposed[p]]), ['e<sub>TI</sub>', null, pct(c.checks.e_TI, 2)],
  ] : [];
  $('#readout').innerHTML = rows.map((x) => (x ? `<dt>${x[0]}</dt><dd>${x[2] || fmt(x[1], 4)}</dd>` : '<div class="sep"></div>')).join('')
    + '<div class="unit muted">C and parameters in MPa</div>';
  $('#rho-out').textContent = rho().toFixed(2);
  $('#rho').value = state.i;
  $('#rho').setAttribute('aria-valuetext', `rho f = ${rho().toFixed(2)}`);
  document.querySelectorAll('[data-fiber]').forEach((b) => b.setAttribute('aria-checked', b.dataset.fiber === state.fiber));
  document.querySelectorAll('[data-matrix]').forEach((b) => b.setAttribute('aria-checked', b.dataset.matrix === state.matrix));
}

/* ---------- study design ---------- */
function renderDesign() {
  const fams = [['E-glass', 'ogden'], ['E-glass', 'neo_hooke'], ['carbon', 'ogden'], ['carbon', 'neo_hooke']];
  const glyph = (c) => `<svg viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true"><polygon points="${hexPts(0, 0, 1)}" class="hx"/>${c.rho > 0 ? `<circle r="${fiberR(c.rho).toFixed(3)}" fill="${fcol(c.fiber)}"/>` : ''}</svg>`;
  const cur = current();
  $('#design-matrix').innerHTML = `<caption>Fiber volume fraction &rho;<sub>f</sub> across; one cell per configuration</caption><thead><tr><th class="l">Fiber, matrix</th>${RHO.map((r) => `<th>${r.toFixed(2)}</th>`).join('')}</tr></thead><tbody>${fams.map(([f, m]) =>
    `<tr><th class="l" scope="row"><span class="sw" style="background:${fcol(f)}"></span>${f}, ${MATRIX_NAME[m]}</th>${RHO.map((r) => {
      const c = SITE.cases.find((x) => x.fiber === f && x.matrix === m && near(x.rho, r));
      return c ? `<td><button type="button" data-case="${c.id}" class="${cur && cur.id === c.id ? 'sel' : ''}" aria-label="${f}, ${MATRIX_NAME[m]}, rho f ${r.toFixed(2)}" >${glyph(c)}</button></td>` : '<td></td>';
    }).join('')}</tr>`).join('')}</tbody>`;
}

/* ---------- step navigator ---------- */
function watchSteps() {
  const links = [...document.querySelectorAll('#step-nav a')];
  const secs = links.map((a) => $(a.getAttribute('href')));
  const on = () => {
    let k = -1;
    secs.forEach((s, n) => { if (s.getBoundingClientRect().top <= innerHeight * 0.3) k = n; });
    links.forEach((a, n) => (n === k ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
  };
  addEventListener('scroll', on, { passive: true }); on();
}

/* ---------- run table ---------- */
const COLS = [
  { k: 'fiber', h: 'Fiber', l: true, v: (c) => c.fiber, f: (c) => `<span class="sw" style="background:${fcol(c.fiber)}"></span>${c.fiber}` },
  { k: 'matrix', h: 'Matrix', l: true, v: (c) => c.matrix, f: (c) => MATRIX_NAME[c.matrix] },
  { k: 'rho', h: 'ρ<sub>f</sub>', v: (c) => c.rho, f: (c) => c.rho.toFixed(2) },
  { k: 'seed', h: 's / h', v: (c) => 0.05 / c.seed, f: (c) => fmt(0.05 / c.seed, 3) },
  ...CK.map((k, n) => ({ k, h: CH[k], v: (c) => c.C[n], f: (c) => fmt(c.C[n], 6) })),
  { k: 'eti', h: 'e<sub>TI</sub>', v: (c) => c.checks.e_TI, f: (c) => fmt(c.checks.e_TI, 2) },
];
function renderRuns() {
  const t = $('#run-table');
  const s = state.sort;
  t.tHead.innerHTML = `<tr>${COLS.map((c) => `<th scope="col" class="${c.l ? 'l' : ''}" data-k="${c.k}" ${s && s.k === c.k ? `aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.h}</th>`).join('')}</tr>`;
  const q = $('#run-search').value.trim().toLowerCase();
  let rows = (state.study === 'main' ? SITE.cases : SITE.mesh).slice();
  if (q) rows = rows.filter((c) => [c.fiber, MATRIX_NAME[c.matrix], c.rho.toFixed(2), `s/${fmt(0.05 / c.seed, 3)}`].join(' ').toLowerCase().includes(q));
  const sc = s && COLS.find((c) => c.k === s.k);
  rows.sort(sc ? (a, b) => (sc.v(a) > sc.v(b) ? 1 : sc.v(a) < sc.v(b) ? -1 : 0) * s.dir
    : (a, b) => a.matrix.localeCompare(b.matrix) || a.fiber.localeCompare(b.fiber) || a.rho - b.rho || b.seed - a.seed);
  const cur = current();
  t.tBodies[0].innerHTML = rows.map((c) => `<tr data-id="${c.id}" tabindex="0" class="${cur && c.id === cur.id ? 'sel' : ''}">${COLS.map((k) => `<td class="${k.l ? 'l' : ''}">${k.f(c)}</td>`).join('')}</tr>`).join('');
  $('#run-count').textContent = `${rows.length} ${state.study === 'main' ? 'configurations' : 'meshes'}`;
  document.querySelectorAll('[data-study]').forEach((b) => b.setAttribute('aria-checked', b.dataset.study === state.study));
}

/* ---------- run drawer ---------- */
let lastFocus = null;
async function openRun(id) {
  lastFocus = document.activeElement;
  const d = await fetch(`data/configurations/${id}.json`).then((r) => r.json());
  const title = `${d.fiber === 'carbon' ? 'Carbon' : 'E-glass'} fiber in ${MATRIX_NAME[d.matrix]} matrix, ρ<sub>f</sub> = ${d.rho.toFixed(2)}`
    + (Math.abs(d.s_h - 50) > 1e-6 ? `, mesh <i>h</i> = <i>s</i>/${+d.s_h}` : '');
  $('#drawer-title').innerHTML = title;
  const C = d.C;
  const mx = Math.max(...C.flat().map(Math.abs));
  const shade = (v) => {
    const a = Math.abs(v) / mx;
    const w = a < 1e-9 ? 0 : Math.max(0.06, (Math.log10(a) + 9) / 9) * 32;
    return `background:color-mix(in srgb, ${fcol(d.fiber)} ${w.toFixed(0)}%, transparent)`;
  };
  const cmat = `<div class="scroll"><table class="cmat"><thead><tr><th></th>${[1, 2, 3, 4, 5, 6].map((j) => `<th>${j}</th>`).join('')}</tr></thead><tbody>${C.map((row, i) =>
    `<tr><th>${i + 1}</th>${row.map((v) => `<td style="${shade(v)}">${fmt(v, Math.abs(v) / mx < 1e-6 ? 2 : 6)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const kv = (o, names = {}) => `<dl class="kv">${Object.entries(o).map(([k, v]) => `<div><dt>${names[k] || k}</dt><dd>${typeof v === 'number' ? fmt(v, 6) : v}</dd></div>`).join('')}</dl>`;
  const eng = d.engineering || {};
  const engNames = { E1: 'E<sub>1</sub>', E2: 'E<sub>2</sub>', nu12: '&nu;<sub>12</sub>', nu23: '&nu;<sub>23</sub>', mu12: '&mu;<sub>12</sub>', mu23: '&mu;<sub>23</sub>' };
  const fit = (label, ps, err) => (ps ? `<h3>${label}</h3>` + kv(ps, PH) : '');
  $('#drawer-body').innerHTML = `
    <h3>Effective stiffness C <small class="muted">MPa, Voigt order 11, 22, 33, 23, 13, 12</small></h3>${cmat}
    <h3>Transverse-isotropy residuals</h3>${kv({ e_TI: d.checks.e_TI, e_c: d.checks.e_c, e_s: d.checks.e_s },
      { e_TI: 'e<sub>TI</sub>', e_c: 'e<sub>c</sub>', e_s: 'e<sub>s</sub>' })}
    <h3>Engineering constants</h3>${kv(eng, engNames)}
    ${fit('Proposed model', d.proposed, d.proposed_error)}
    ${fit('Model of Vogler et al.', d.vogler, d.vogler_error)}`;
  $('#drawer').hidden = false; $('#backdrop').hidden = false;
  $('#drawer-close').focus();
  if (location.hash !== `#run/${id}`) history.replaceState(null, '', `#run/${id}`);
}
function closeRun() {
  $('#drawer').hidden = true; $('#backdrop').hidden = true;
  if (location.hash.startsWith('#run/')) history.replaceState(null, '', location.pathname + location.search);
  if (lastFocus) lastFocus.focus();
}

/* ---------- wiring ---------- */
function update() {
  drawCell(); renderReadout(); renderDesign(); renderMesh(); renderStiffness(); renderParams(); renderDeviation(); renderRuns();
}
async function init() {
  SITE = await fetch('data/site.json').then((r) => r.json());
  $('#rho').addEventListener('input', (e) => { state.i = +e.target.value; update(); });
  document.querySelectorAll('[data-fiber]').forEach((b) => (b.onclick = () => { state.fiber = b.dataset.fiber; update(); }));
  document.querySelectorAll('[data-matrix]').forEach((b) => (b.onclick = () => { state.matrix = b.dataset.matrix; update(); }));
  document.querySelectorAll('[data-study]').forEach((b) => (b.onclick = () => { state.study = b.dataset.study; state.sort = null; renderRuns(); }));
  $('#logy').addEventListener('change', (e) => { state.logy = e.target.checked; renderStiffness(); });
  $('#run-search').addEventListener('input', renderRuns);
  $('#run-table').tHead.addEventListener('click', (e) => {
    const th = e.target.closest('th'); if (!th) return;
    state.sort = state.sort && state.sort.k === th.dataset.k ? { k: th.dataset.k, dir: -state.sort.dir } : { k: th.dataset.k, dir: 1 };
    renderRuns();
  });
  const tb = $('#run-table').tBodies[0];
  tb.addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) openRun(tr.dataset.id); });
  tb.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr'); if (tr) openRun(tr.dataset.id); } });
  $('#design-matrix').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pickCase(SITE.cases.find((c) => c.id === b.dataset.case)); });
  $('#open-current').onclick = () => { const c = current(); if (c) openRun(c.id); };
  $('#drawer-close').onclick = closeRun; $('#backdrop').onclick = closeRun;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeRun(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  renderLedger(); renderGain(); renderTests(); renderResiduals(); update(); watchSteps();
  const route = () => { const m = /^#run\/([a-z0-9.-]+)$/.exec(location.hash); if (m) openRun(m[1]); };
  addEventListener('hashchange', route);
  route();
}
init();
