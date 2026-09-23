// Headless smoke test: serves the repo root, loads the site in Chrome, clicks every tab,
// checks for console/page errors and that the provider table has one row per CSV record.
// Usage: node scripts/smoke_test.mjs            (starts python3 -m http.server on 8765)
//        SMOKE_URL=https://example.github.io/adult-day-care-watch/ node scripts/smoke_test.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const STATE = process.env.SMOKE_STATE || 'nj';
const PORT = 8765;
const baseUrl = process.env.SMOKE_URL || `http://localhost:${PORT}/`;

function csvRowCount(path) {
  const text = readFileSync(path, 'utf8');
  let rows = 0, inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === '\n' && !inQuotes) rows++;
  }
  if (!text.endsWith('\n')) rows++;
  return rows - 1; // header
}

let server;
if (!process.env.SMOKE_URL) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
}

const expectedRows = csvRowCount(`states/${STATE}/providers.csv`);
const errors = [];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${baseUrl}?state=${STATE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tab-overview[data-ready]', { timeout: 30000 });

  for (const tab of ['providers', 'enforcement', 'methodology', 'howto', 'overview']) {
    await page.click(`nav[role=tablist] button[data-tab=${tab}]`);
    await page.waitForSelector(`#tab-${tab}[data-ready]`, { timeout: 30000 });
    const hidden = await page.$eval(`#tab-${tab}`, el => el.hidden);
    if (hidden) errors.push(`tab ${tab} still hidden after click`);
  }

  await page.click('nav[role=tablist] button[data-tab=providers]');
  const rows = await page.$$eval('#providers-table tbody tr', trs => trs.length);
  if (rows !== expectedRows) errors.push(`providers table has ${rows} rows, CSV has ${expectedRows}`);

  const flagText = await page.$$eval('#providers-table .flag', els => els.map(e => e.textContent + ' ' + e.title).join(' '));
  if (/fraud/i.test(flagText)) errors.push('flag text contains the word "fraud"');

  if (process.env.SMOKE_SHOT) {
    await page.click('nav[role=tablist] button[data-tab=overview]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: process.env.SMOKE_SHOT, fullPage: true });
  }
} catch (e) {
  errors.push(`exception: ${e.message}`);
} finally {
  await browser?.close();
  server?.kill();
}

if (errors.length) {
  console.error('SMOKE TEST FAILED');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`smoke test passed: ${expectedRows} providers rendered, all tabs ready, no console errors`);
