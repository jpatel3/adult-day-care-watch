import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [w, tabs] of [[1280, ['overview', 'providers', 'enforcement', 'methodology']], [400, ['overview', 'providers']]]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto('http://localhost:8766/?state=nj');
  await page.waitForSelector('#tab-overview[data-ready]');
  for (const t of tabs) {
    await page.click(`nav button[data-tab=${t}]`);
    await page.waitForSelector(`#tab-${t}[data-ready]`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `/tmp/shot_${t}_${w}.png`, fullPage: true });
  }
  if (w === 1280) { await page.click('nav button[data-tab=providers]'); await page.click('#providers-table tbody tr'); await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/shot_drawer_1280.png' }); }
  await page.close();
}
await browser.close(); server.kill();
