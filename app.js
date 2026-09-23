// Adult Day Care Watch viewer. Loads one state's folder, computes flags, renders five tabs.
// Globals from CDN scripts: Papa, Chart, L, marked. Pure data logic lives in flags.js.
import { buildContext, computeFlags, matchEnforcement, npiWithoutLicense, FLAG_DEFINITIONS } from './flags.js';

// ---------- URL state ----------
const TABS = ['overview', 'providers', 'enforcement', 'methodology', 'howto'];
export function getUrlState() {
  const p = new URLSearchParams(location.search);
  return Object.fromEntries(p.entries());
}
export function setUrlState(patch) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '' || v === false) p.delete(k); else p.set(k, String(v));
  }
  history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
}

// ---------- Formatting ----------
export const fmtMoney = n => {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3).toLocaleString()}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};
export const fmtInt = n => (n == null || Number.isNaN(n)) ? '—' : Math.round(n).toLocaleString();
const fmtExact = n => (n == null || Number.isNaN(n)) ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
// Markdown and HTML fragments rendered below come only from files in this repository (config.json,
// methodology.md, HOWTO.md) and from CSV values passed through esc(). Contributors control that content
// via pull request review, so no runtime sanitizer is used. Do not feed user-supplied strings to md() or innerHTML.
const md = s => marked.parse(String(s || ''));

/** Rate in effect on July 1 of a year (the state's fiscal year start), from config.per_diem. */
export function rateForYear(perDiem, year) {
  const cutoff = `${year}-07-01`;
  const rows = perDiem.filter(p => p.effective <= cutoff).sort((a, b) => a.effective.localeCompare(b.effective));
  return rows.length ? rows[rows.length - 1].rate : null;
}
export const impliedDays = (paid, recipients, rate) => (paid && recipients && rate) ? paid / recipients / rate : null;

// ---------- Theme-aware chart colors ----------
function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function chartTheme() {
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.color = tok('--ink-2');
  Chart.defaults.borderColor = tok('--grid');
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.tooltip.backgroundColor = tok('--ink');
  Chart.defaults.plugins.tooltip.titleColor = tok('--surface');
  Chart.defaults.plugins.tooltip.bodyColor = tok('--surface');
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.elements.bar.borderRadius = { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 };
  Chart.defaults.elements.bar.borderSkipped = 'bottom';
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.point.radius = 4;
  Chart.defaults.elements.point.hoverRadius = 6;
  Chart.defaults.scale.grid.color = tok('--grid');
  Chart.defaults.scale.border = { color: tok('--axis') };
}
const SERIES = () => [1, 2, 3, 4, 5].map(i => tok(`--series-${i}`));
const SEQ = () => [1, 2, 3, 4, 5].map(i => tok(`--seq-${i}`));

/** 45° hatch pattern for a partial-year bar (dataviz: texture for "not comparable" marks). */
function hatch(color) {
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
  return g.createPattern(c, 'repeat');
}

const charts = [];
function chartCard(parent, { title, note, source, table }) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<h3>${esc(title)}</h3>${note ? `<p class="muted small">${note}</p>` : ''}<div class="chart-box"><canvas role="img" aria-label="${esc(title)}"></canvas></div>
    <details class="table-view"><summary>Table view</summary>${table}</details>${source ? `<p class="source">Source: ${source}</p>` : ''}`;
  parent.appendChild(card);
  return card.querySelector('canvas');
}
function htmlTable(headers, rows, numericCols = []) {
  return `<table><thead><tr>${headers.map((h, i) => `<th${numericCols.includes(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${numericCols.includes(i) ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
/** Split a long label into lines of at most `max` chars (Chart.js renders array labels as multi-line). */
function wrapLabel(s, max) {
  const words = String(s).split(' '); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur); return lines;
}
const srcLink = url => url ? `<a href="${esc(url)}" rel="noopener">document</a>` : '';

// ---------- Data loading ----------
async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}
function parseCsv(text) {
  const out = Papa.parse(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, dynamicTyping: false });
  return out.data;
}
export async function loadState(id) {
  const base = `states/${id}/`;
  const [cfgText, provText, npiText, enfText] = await Promise.all([
    fetchText(base + 'config.json'), fetchText(base + 'providers.csv'),
    fetchText(base + 'npi_registry.csv'), fetchText(base + 'enforcement.csv'),
  ]);
  return { id, config: JSON.parse(cfgText), providers: parseCsv(provText), npi: parseCsv(npiText), enforcement: parseCsv(enfText) };
}

// ---------- Overview ----------
function renderOverview(el, data) {
  const { config: c, providers } = data;
  const complete = c.spending.filter(s => !s.partial);
  const latest = complete[complete.length - 1];
  const rateLatest = latest ? rateForYear(c.per_diem, latest.year) : null;
  const days = latest ? impliedDays(latest.paid, latest.recipients, rateLatest) : null;
  const slots = providers.reduce((a, p) => a + (num(p.licensed_slots) || 0), 0);
  const currentRate = [...c.per_diem].sort((a, b) => a.effective.localeCompare(b.effective)).pop();
  const spendSrc = c.spending[0]?.source;

  el.innerHTML = `
    <h2>${esc(c.name)}: ${esc(c.program_name || 'Adult day care')}</h2>
    <p class="muted">${esc(c.payer_program || '')}</p>
    <div class="grid tiles" id="tiles"></div>
    <h2>The money</h2>
    <div class="grid charts" id="charts"></div>
    <h2>How it works</h2>
    <div class="grid two" id="narrative"></div>`;

  const tiles = [
    ['Licensed centers', fmtInt(providers.length), `${esc(c.regulator || 'state roster')}, as of ${esc(c.data_as_of)}`],
    ['Licensed slots', fmtInt(slots), 'Sum of licensed daily capacity across all centers'],
    latest && ['Medicaid paid', fmtMoney(latest.paid), `${latest.year}, latest complete year. <a href="${esc(spendSrc)}" rel="noopener">source</a>`],
    latest && ['Recipients', fmtInt(latest.recipients), `People who received at least one paid day in ${latest.year}`],
    currentRate && ['Per diem now', `$${currentRate.rate.toFixed(2)}`, `Minimum rate per participant per day since ${esc(currentRate.effective)}`],
    days && ['Implied billed days', Math.round(days), `Per recipient in ${latest.year}: paid ÷ recipients ÷ $${rateLatest.toFixed(2)}. Max allowed is 260.`],
  ].filter(Boolean);
  document.getElementById('tiles').innerHTML = tiles.map(([l, v, f]) => `<div class="card tile"><p class="label">${l}</p><p class="value">${v}</p><p class="foot">${f}</p></div>`).join('');

  chartTheme();
  const S = SERIES();
  const wrap = document.getElementById('charts');
  const years = c.spending.map(s => s.year);
  const labels = c.spending.map(s => s.partial ? `${s.year} (partial)` : String(s.year));

  // 1. Spending by year
  let cv = chartCard(wrap, {
    title: 'Medicaid payments by year', note: c.spending.some(s => s.partial) ? 'Hatched bar is a partial year.' : '',
    source: srcLink(spendSrc),
    table: htmlTable(['Year', 'Paid', 'Recipients'], c.spending.map(s => [labels[years.indexOf(s.year)], fmtExact(s.paid), fmtInt(s.recipients)]), [1, 2]),
  });
  charts.push(new Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Paid', data: c.spending.map(s => s.paid), backgroundColor: c.spending.map(s => s.partial ? hatch(S[0]) : S[0]), borderColor: S[0], borderWidth: c.spending.map(s => s.partial ? 1 : 0) }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => fmtMoney(v) } }, x: { grid: { display: false } } } },
  }));

  // 2. Recipients by year
  cv = chartCard(wrap, { title: 'Recipients by year', source: srcLink(spendSrc), table: htmlTable(['Year', 'Recipients'], c.spending.map(s => [labels[years.indexOf(s.year)], fmtInt(s.recipients)]), [1]) });
  charts.push(new Chart(cv, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Recipients', data: c.spending.map(s => s.recipients), borderColor: S[0], backgroundColor: S[0], tension: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, ticks: { callback: v => fmtInt(v) } }, x: { grid: { display: false } } } },
  }));

  // 3. Implied billed days per recipient (complete years)
  const daysRows = complete.map(s => ({ year: s.year, rate: rateForYear(c.per_diem, s.year), days: impliedDays(s.paid, s.recipients, rateForYear(c.per_diem, s.year)) }));
  const capLine = { id: 'capLine', afterDraw(chart) {
    const y = chart.scales.y.getPixelForValue(260); const { left, right } = chart.chartArea; const g = chart.ctx;
    g.save(); g.strokeStyle = tok('--axis'); g.lineWidth = 1; g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke();
    g.fillStyle = tok('--muted'); g.font = '11px system-ui'; g.textAlign = 'right'; g.fillText('260 = 5 days × 52 weeks', right - 4, y - 4); g.restore();
  } };
  cv = chartCard(wrap, {
    title: 'Implied billed days per recipient', note: 'Paid ÷ recipients ÷ per diem in effect that fiscal year. A rough average of how many days each recipient was billed.',
    source: srcLink(spendSrc),
    table: htmlTable(['Year', 'Per diem used', 'Implied days'], daysRows.map(r => [r.year, `$${r.rate?.toFixed(2)}`, r.days ? Math.round(r.days) : '—']), [1, 2]),
  });
  charts.push(new Chart(cv, {
    type: 'bar', plugins: [capLine],
    data: { labels: daysRows.map(r => String(r.year)), datasets: [{ label: 'Implied days', data: daysRows.map(r => r.days), backgroundColor: S[0] }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${Math.round(ctx.parsed.y)} days` } } },
      scales: { y: { beginAtZero: true, suggestedMax: 280 }, x: { grid: { display: false } } } },
  }));

  // 4. Per diem rate (stepped)
  const pd = [...c.per_diem].sort((a, b) => a.effective.localeCompare(b.effective));
  const pdLabels = [...pd.map(p => p.effective), c.data_as_of];
  const pdData = [...pd.map(p => p.rate), pd[pd.length - 1].rate];
  cv = chartCard(wrap, { title: 'Minimum per diem rate', note: 'What Medicaid pays a center for one participant for one day.',
    table: htmlTable(['Effective', 'Rate', 'Source'], pd.map(p => [p.effective, `$${p.rate.toFixed(2)}`, p.source || '']), [1]) });
  charts.push(new Chart(cv, {
    type: 'line',
    data: { labels: pdLabels, datasets: [{ label: 'Per diem', data: pdData, borderColor: S[0], backgroundColor: S[0], stepped: 'before' }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `$${ctx.parsed.y.toFixed(2)}` } } },
      scales: { y: { ticks: { callback: v => `$${v}` } }, x: { grid: { display: false }, ticks: { callback: (v, i) => pdLabels[i].slice(0, 7) } } } },
  }));

  // 5. Paid by payer
  if (c.payers?.length) {
    const payers = c.payers.slice(0, 5);
    const total = payers.reduce((a, p) => a + p.paid, 0);
    cv = chartCard(wrap, { title: 'Paid by managed care organization', note: `${esc(payers[0].window || '')}. Share of ${fmtMoney(total)}.`, source: srcLink(payers[0].source),
      table: htmlTable(['Payer', 'Paid', 'Share'], payers.map(p => [p.name, fmtExact(p.paid), `${(100 * p.paid / total).toFixed(0)}%`]), [1, 2]) });
    charts.push(new Chart(cv, {
      type: 'bar',
      data: { labels: payers.map(p => wrapLabel(p.name, 18)), datasets: [{ label: 'Paid', data: payers.map(p => p.paid), backgroundColor: payers.map((_, i) => S[i]) }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${fmtMoney(ctx.parsed.x)} (${(100 * ctx.parsed.x / total).toFixed(0)}%)` } } },
        elements: { bar: { borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 }, borderSkipped: 'left' } },
        scales: { x: { beginAtZero: true, ticks: { callback: v => fmtMoney(v) } }, y: { grid: { display: false } } } },
    }));
  }

  const n = c.narrative || {};
  const blocks = [['How a center gets paid', n.how_paid], ['What is not public', n.what_not_public], ['What the record shows', n.assessment], ['Where the centers are', n.geography]].filter(b => b[1]);
  document.getElementById('narrative').innerHTML = blocks.map(([t, body]) => `<div class="card prose"><h3>${esc(t)}</h3>${md(body)}</div>`).join('');
  if (c.billing_rules) document.getElementById('narrative').insertAdjacentHTML('afterbegin', `<div class="card prose" style="grid-column:1/-1"><h3>Billing rules</h3><p>${esc(c.billing_rules)}</p></div>`);
}

// ---------- Providers ----------
let map, markers, drawerProvider;
function renderProviders(el, data) {
  const { config: c, providers, npi, enforcement } = data;
  const ctx = buildContext({ providers, npi, enforcement, dataAsOf: c.data_as_of });
  providers.forEach(p => { p._flags = computeFlags(p, ctx); p._slots = num(p.licensed_slots); });
  const counties = [...new Set(providers.map(p => p.county).filter(Boolean))].sort();
  const ownerTypes = [...new Set(providers.map(p => p.owner_type).filter(Boolean))].sort();
  const u = getUrlState();

  el.innerHTML = `
    <h2>Licensed providers</h2>
    <p class="muted">Every ${esc(c.program_name || 'adult day care')} license on the ${esc(c.regulator || 'state')} roster as of ${esc(c.data_as_of)}, with the licensed owner entity and contact details as the state publishes them. Click a row for every column and any matched enforcement actions.</p>
    <div class="controls">
      <label>Search <input type="search" id="q" placeholder="Name, owner, city, administrator, license #" value="${esc(u.q || '')}"></label>
      <label>County <select id="county"><option value="">All</option>${counties.map(x => `<option${u.county === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label>Owner type <select id="owner_type"><option value="">All</option>${ownerTypes.map(x => `<option${u.owner_type === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label>Sort <select id="sort">
        <option value="name">Name</option><option value="slots">Slots, largest first</option><option value="county">County</option><option value="owner">Owner</option><option value="flags">Most flags</option>
      </select></label>
      <fieldset class="flags"><legend>Worth a look</legend>${FLAG_DEFINITIONS.map(f => `<label><input type="checkbox" name="flag" value="${f.code}"${(u.flags || '').split(',').includes(f.code) ? ' checked' : ''}> ${esc(f.short)}</label>`).join('')}</fieldset>
      <button class="btn" id="download">Download filtered CSV</button>
    </div>
    <p class="count-line" id="count"></p>
    <div class="providers-layout">
      <div><div id="map" role="region" aria-label="Map of licensed centers"></div>
        <div class="map-legend" id="map-legend"></div></div>
      <div class="table-scroll"><table id="providers-table" class="stack"><thead><tr>
        <th class="sortable" data-sort="name">Name</th><th class="sortable" data-sort="city">City</th><th class="sortable" data-sort="county">County</th>
        <th class="sortable num" data-sort="slots">Slots</th><th class="sortable" data-sort="owner">Licensed owner</th><th>Worth a look</th>
      </tr></thead><tbody></tbody></table></div>
    </div>
    <h2>NPI records with no license at that address</h2>
    <p class="muted">Organizations in the federal NPI registry with the Adult Day Care taxonomy whose street address matches no license on the roster. Most are social day programs (no license required), closed centers that never deactivated their NPI, or the same center under a second address. Some may be unlicensed operators. <span id="npi-count"></span></p>
    <details class="table-view"><summary>Show list</summary><div class="table-scroll" id="npi-orphans"></div></details>`;

  const sortSel = el.querySelector('#sort'); sortSel.value = u.sort || 'name';
  const orphans = npiWithoutLicense(npi, providers);
  el.querySelector('#npi-count').textContent = `${orphans.length} of ${npi.length} NPI records.`;
  el.querySelector('#npi-orphans').innerHTML = htmlTable(['NPI', 'Name', 'Authorized official', 'Address', 'City', 'Phone', 'Status'],
    orphans.map(n => [n.npi, n.name, `${n.official}${n.official_title ? ` (${n.official_title})` : ''}`, n.address, n.city, n.phone, n.status]));

  // Map
  map = L.map('map', { scrollWheelZoom: false }).setView(c.map_center || [39.8, -98.5], c.map_zoom || 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  markers = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
  map.addLayer(markers);
  const slotVals = providers.map(p => p._slots).filter(v => v > 0).sort((a, b) => a - b);
  const q = k => slotVals[Math.min(slotVals.length - 1, Math.floor(k * slotVals.length))];
  const breaks = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const seq = SEQ();
  const colorFor = s => s == null ? tok('--muted') : seq[breaks.filter(b => s > b).length];
  el.querySelector('#map-legend').innerHTML = `<span>Licensed slots:</span>` +
    [`≤${breaks[0]}`, `${breaks[0] + 1}–${breaks[1]}`, `${breaks[1] + 1}–${breaks[2]}`, `${breaks[2] + 1}–${breaks[3]}`, `>${breaks[3]}`].map((l, i) => `<span><i style="background:${seq[i]}"></i>${l}</span>`).join('');

  const tbody = el.querySelector('#providers-table tbody');
  const flagLabel = code => FLAG_DEFINITIONS.find(f => f.code === code)?.short || code;

  function currentFilter() {
    const qv = el.querySelector('#q').value.trim().toLowerCase();
    const county = el.querySelector('#county').value, ot = el.querySelector('#owner_type').value;
    const flags = [...el.querySelectorAll('input[name=flag]:checked')].map(i => i.value);
    const sort = sortSel.value;
    setUrlState({ q: qv, county, owner_type: ot, flags: flags.join(','), sort: sort === 'name' ? '' : sort });
    let rows = providers.filter(p => (!county || p.county === county) && (!ot || p.owner_type === ot)
      && flags.every(f => p._flags.some(x => x.code === f))
      && (!qv || [p.licensed_name, p.dba_alpha_name, p.licensed_owner, p.city, p.administrator, p.license_no, p.address].join(' ').toLowerCase().includes(qv)));
    const cmp = { name: (a, b) => a.licensed_name.localeCompare(b.licensed_name), city: (a, b) => (a.city || '').localeCompare(b.city || '') || a.licensed_name.localeCompare(b.licensed_name),
      slots: (a, b) => (b._slots || 0) - (a._slots || 0), county: (a, b) => (a.county || '').localeCompare(b.county || '') || a.licensed_name.localeCompare(b.licensed_name),
      owner: (a, b) => (a.licensed_owner || '').localeCompare(b.licensed_owner || ''), flags: (a, b) => b._flags.length - a._flags.length || a.licensed_name.localeCompare(b.licensed_name) }[sort];
    return rows.sort(cmp);
  }

  function draw() {
    const rows = currentFilter();
    const slots = rows.reduce((a, p) => a + (p._slots || 0), 0);
    el.querySelector('#count').textContent = `${rows.length} of ${providers.length} centers, ${fmtInt(slots)} licensed slots.`;
    tbody.innerHTML = rows.map((p, i) => `<tr tabindex="0" data-i="${providers.indexOf(p)}">
      <td class="name" data-label="Name">${esc(p.licensed_name)}</td><td data-label="City">${esc(p.city)}</td><td data-label="County">${esc(p.county)}</td>
      <td class="num" data-label="Slots">${p._slots ?? ''}</td><td data-label="Licensed owner">${esc(p.licensed_owner)}</td>
      <td data-label="Worth a look">${p._flags.map(f => `<span class="flag" title="${esc(f.detail)}">${esc(flagLabel(f.code))}</span>`).join('')}</td></tr>`).join('');
    markers.clearLayers();
    const pts = [];
    for (const p of rows) {
      const lat = num(p.lat), lng = num(p.lng);
      if (!lat || !lng) continue;
      const m = L.circleMarker([lat, lng], { radius: Math.max(6, Math.min(16, Math.sqrt(p._slots || 40) * 0.9)), color: tok('--surface'), weight: 2, fillColor: colorFor(p._slots), fillOpacity: 0.9 });
      m.bindPopup(`<strong>${esc(p.licensed_name)}</strong><br>${esc(p.address)}, ${esc(p.city)}<br>${p._slots ?? '?'} slots · ${esc(p.licensed_owner)}<br><a href="#" data-open="${providers.indexOf(p)}">Details</a>`);
      markers.addLayer(m); pts.push([lat, lng]);
    }
    if (pts.length && (el.querySelector('#county').value || el.querySelector('#q').value)) map.fitBounds(pts, { padding: [20, 20], maxZoom: 12 });
    el.dataset.ready = '1';
  }

  el.querySelectorAll('#q, #county, #owner_type, #sort, input[name=flag]').forEach(i => i.addEventListener('input', draw));
  el.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => { sortSel.value = th.dataset.sort; draw(); }));
  tbody.addEventListener('click', e => { const tr = e.target.closest('tr'); if (tr) openDrawer(providers[+tr.dataset.i], ctx); });
  tbody.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr'); if (tr) { e.preventDefault(); openDrawer(providers[+tr.dataset.i], ctx); } } });
  map.on('popupopen', e => { e.popup.getElement().querySelector('[data-open]')?.addEventListener('click', ev => { ev.preventDefault(); openDrawer(providers[+ev.target.dataset.open], ctx); }); });
  el.querySelector('#download').addEventListener('click', () => {
    const rows = currentFilter().map(p => { const o = { ...p }; o.worth_a_look = p._flags.map(f => f.code).join(';'); delete o._flags; delete o._slots; return o; });
    const blob = new Blob([Papa.unparse(rows)], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${data.id}_providers_filtered.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  });
  draw();
  setTimeout(() => map.invalidateSize(), 50);
}

function openDrawer(p, ctx) {
  drawerProvider = p;
  const d = document.getElementById('drawer');
  document.getElementById('drawer-title').textContent = p.licensed_name;
  const skip = new Set(['_flags', '_slots', 'lat', 'lng']);
  const kv = Object.entries(p).filter(([k, v]) => !skip.has(k) && String(v ?? '').trim() !== '')
    .map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${k === 'email' ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : esc(v)}</dd>`).join('');
  const enf = matchEnforcement(p, ctx);
  document.getElementById('drawer-body').innerHTML = `
    <div class="flag-list">${p._flags.map(f => `<div><span class="flag">${esc(f.label)}</span><p class="flag-detail">${esc(f.detail)}</p></div>`).join('') || '<p class="muted">Nothing flagged.</p>'}</div>
    <h3>Enforcement matches</h3>
    ${enf.length ? `<ul>${enf.map(e => `<li>${esc(e.date)}: <strong>${esc(e.action)}</strong>, ${esc(e.provider)}${e.amount ? `, ${fmtExact(num(e.amount))}` : ''} <span class="muted small">(${esc(e.agency)}; matched by ${e.via})</span> ${e.url ? `<a href="${esc(e.url)}" rel="noopener">document</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">None in enforcement.csv.</p>'}
    <h3>All columns</h3><dl class="kv">${kv}</dl>
    ${num(p.lat) && num(p.lng) ? `<p><a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}" rel="noopener">Open in OpenStreetMap</a></p>` : ''}`;
  d.hidden = false;
  document.getElementById('drawer-close').focus();
}

// ---------- Enforcement ----------
function renderEnforcement(el, data) {
  const { enforcement, providers, config: c } = data;
  const rows = [...enforcement].sort((a, b) => b.date.localeCompare(a.date));
  const withAmt = rows.filter(r => num(r.amount) != null);
  const total = withAmt.reduce((a, r) => a + num(r.amount), 0);
  const byLicense = new Map(providers.map(p => [String(p.license_no), p]));
  el.innerHTML = `
    <h2>Enforcement history</h2>
    <p class="muted">Public settlement agreements, notices of overpayment and licensing orders involving adult day care providers. Amounts are the largest dollar figure stated in each document, so a settlement total or an identified overpayment, not a fine. Links go to the agency's own PDF.</p>
    <div class="grid tiles">
      <div class="card tile"><p class="label">Actions</p><p class="value">${rows.length}</p><p class="foot">${new Set(rows.map(r => r.agency)).size} agencies, ${rows.length ? `${rows[rows.length - 1].date.slice(0, 4)}–${rows[0].date.slice(0, 4)}` : ''}</p></div>
      <div class="card tile"><p class="label">Providers named</p><p class="value">${new Set(rows.map(r => r.provider)).size}</p><p class="foot">${rows.filter(r => r.matched_license_no).length} actions matched to a current license</p></div>
      <div class="card tile"><p class="label">Stated amounts</p><p class="value">${fmtMoney(total)}</p><p class="foot">Across ${withAmt.length} documents that state a figure</p></div>
    </div>
    <div class="controls" style="margin-top:14px"><button class="btn small" id="v-timeline" aria-pressed="true">Timeline</button><button class="btn small" id="v-table" aria-pressed="false">Table</button></div>
    <div id="enf-view"></div>
    <div class="grid charts" style="margin-top:16px" id="enf-chart"></div>`;
  const provLink = r => r.matched_license_no && byLicense.get(String(r.matched_license_no))
    ? `<a href="?state=${data.id}&tab=providers&q=${encodeURIComponent(byLicense.get(String(r.matched_license_no)).license_no)}">${esc(r.provider)}</a>` : esc(r.provider);
  const view = el.querySelector('#enf-view');
  const timeline = () => {
    let html = '<ol class="timeline">', year = '';
    for (const r of rows) {
      if (r.date.slice(0, 4) !== year) { year = r.date.slice(0, 4); html += `<li class="year">${year}</li>`; }
      html += `<li class="item"><div class="date">${esc(r.date)} · ${esc(r.agency)}</div><div class="who">${provLink(r)}</div><div>${esc(r.action)}${num(r.amount) != null ? ` · ${fmtExact(num(r.amount))}` : ''}${r.issues ? ` <span class="muted small">(${esc(r.issues)})</span>` : ''} ${r.url ? `<a href="${esc(r.url)}" rel="noopener">Document ↗</a>` : ''}</div></li>`;
    }
    view.innerHTML = html + '</ol>';
  };
  const table = () => {
    view.innerHTML = `<div class="table-scroll"><table class="stack"><thead><tr><th>Date</th><th>Provider</th><th>Agency</th><th>Action</th><th class="num">Amount</th><th>Issues noted</th><th>Document</th></tr></thead><tbody>
      ${rows.map(r => `<tr style="cursor:default"><td data-label="Date">${esc(r.date)}</td><td class="name" data-label="Provider">${provLink(r)}</td><td data-label="Agency">${esc(r.agency)}</td><td data-label="Action">${esc(r.action)}</td><td class="num" data-label="Amount">${fmtExact(num(r.amount))}</td><td data-label="Issues">${esc(r.issues)}</td><td data-label="Document">${r.url ? `<a href="${esc(r.url)}" rel="noopener">PDF</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  };
  el.querySelector('#v-timeline').addEventListener('click', () => { timeline(); el.querySelector('#v-timeline').setAttribute('aria-pressed', 'true'); el.querySelector('#v-table').setAttribute('aria-pressed', 'false'); });
  el.querySelector('#v-table').addEventListener('click', () => { table(); el.querySelector('#v-table').setAttribute('aria-pressed', 'true'); el.querySelector('#v-timeline').setAttribute('aria-pressed', 'false'); });
  timeline();

  chartTheme();
  const byYear = new Map();
  for (const r of rows) byYear.set(r.date.slice(0, 4), (byYear.get(r.date.slice(0, 4)) || 0) + 1);
  const ys = [...byYear.keys()].sort();
  const cv = chartCard(el.querySelector('#enf-chart'), { title: 'Actions by year', table: htmlTable(['Year', 'Actions'], ys.map(y => [y, byYear.get(y)]), [1]) });
  charts.push(new Chart(cv, { type: 'bar', data: { labels: ys, datasets: [{ label: 'Actions', data: ys.map(y => byYear.get(y)), backgroundColor: SERIES()[0] }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } }));
  el.dataset.ready = '1';
}

// ---------- Methodology & How-to ----------
async function renderMethodology(el, data) {
  const text = await fetchText('methodology.md');
  const flagsHtml = `<h2>Flag rules in this build</h2><table><thead><tr><th>Flag</th><th>Rule</th></tr></thead><tbody>${FLAG_DEFINITIONS.map(f => `<tr><td><span class="flag">${esc(f.short)}</span></td><td>${esc(f.rule)}</td></tr>`).join('')}</tbody></table>`;
  const sources = `<h2>Sources for ${esc(data.config.name)}</h2><ol>${(data.config.sources || []).map(s => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a>${s.local ? ` · <a href="states/${data.id}/${esc(s.local)}">saved copy</a>` : ''}</li>`).join('')}</ol>
    ${data.config.spending_source_note ? `<p class="muted small">${esc(data.config.spending_source_note)}</p>` : ''}`;
  el.innerHTML = `<div class="prose">${md(text)}${flagsHtml}${sources}</div>`;
  el.dataset.ready = '1';
}
async function renderHowto(el) {
  const text = await fetchText('states/_template/HOWTO.md');
  el.innerHTML = `<div class="prose">${md(text)}</div>`;
  el.dataset.ready = '1';
}

// ---------- Tabs & boot ----------
const rendered = new Set();
let DATA;
async function renderTab(name) {
  const el = document.getElementById(`tab-${name}`);
  if (!rendered.has(name)) {
    rendered.add(name);
    try {
      if (name === 'overview') renderOverview(el, DATA);
      else if (name === 'providers') renderProviders(el, DATA);
      else if (name === 'enforcement') renderEnforcement(el, DATA);
      else if (name === 'methodology') await renderMethodology(el, DATA);
      else if (name === 'howto') await renderHowto(el);
      el.dataset.ready = '1';
    } catch (e) {
      el.innerHTML = `<p class="card">Could not render this section: ${esc(e.message)}</p>`;
      el.dataset.ready = '1';
      console.error(e);
    }
  }
  if (name === 'providers' && map) setTimeout(() => map.invalidateSize(), 30);
}
function showTab(name) {
  if (!TABS.includes(name)) name = 'overview';
  for (const t of TABS) {
    document.getElementById(`tab-${t}`).hidden = t !== name;
    document.querySelector(`nav[role=tablist] button[data-tab=${t}]`).setAttribute('aria-selected', String(t === name));
  }
  setUrlState({ tab: name === 'overview' ? '' : name });
  renderTab(name);
}

async function boot() {
  const states = await fetch('states/index.json').then(r => r.json());
  const u = getUrlState();
  const id = states.some(s => s.id === u.state) ? u.state : states[0].id;
  const picker = document.getElementById('state-picker');
  if (states.length > 1) {
    picker.hidden = false; document.querySelector('.state-label').hidden = false;
    picker.innerHTML = states.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    picker.addEventListener('change', () => { location.search = `?state=${picker.value}`; });
  }
  DATA = await loadState(id);
  document.title = `Adult Day Care Watch: ${DATA.config.name}`;
  document.getElementById('loading').remove();
  document.getElementById('data-as-of').textContent = `${DATA.config.name} data as of ${DATA.config.data_as_of}; compiled ${DATA.config.compiled_on || DATA.config.data_as_of}. ${DATA.providers.length} licenses, ${DATA.npi.length} NPI records, ${DATA.enforcement.length} enforcement actions.`;
  document.querySelectorAll('nav[role=tablist] button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.getElementById('drawer-close').addEventListener('click', () => { document.getElementById('drawer').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('drawer').hidden = true; });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => location.reload());
  showTab(u.tab || 'overview');
}
boot().catch(e => { document.getElementById('loading').textContent = `Could not load data: ${e.message}`; console.error(e); });
