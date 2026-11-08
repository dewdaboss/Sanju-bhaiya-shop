import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright';

assert.ok(existsSync('dist/index.html'), 'Run npm run build before npm run test:ui.');
const port = Number(process.env.UI_PORT || 3100);
const base = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'iconic-ui-'));
const screenshots = resolve(process.env.SCREENSHOT_DIR || 'test-results');
await mkdir(screenshots, { recursive: true });
const password = randomBytes(24).toString('hex');
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DATA_DIR: dataDir, ADMIN_PASSWORD: password, SHOP_WHATSAPP: '917970000601' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
let browser;
const errors = [];
const tomorrow = new Date(Date.now() + 330 * 60_000 + 86400_000).toISOString().slice(0, 10);
const noOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Horizontal overflow detected');
const watch = (page) => { page.on('pageerror', (error) => errors.push(error.message)); page.setDefaultTimeout(15_000); };
const chooseSlot = async (page) => {
  await page.locator('.date-strip button').nth(1).click();
  await page.locator('.slots-loading').waitFor({ state: 'hidden' });
  await page.locator('.slot:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Your details', exact: true }).click();
};

try {
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${serverLog}`)), 20_000);
    child.stdout.on('data', (chunk) => { serverLog += chunk; if (serverLog.includes('Owner login:')) { clearTimeout(timer); resolveReady(); } });
    child.stderr.on('data', (chunk) => { serverLog += chunk; });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${serverLog}`)); });
  });
  // npm-packaged Chromium plus its compatible libraries; no browser CDN download.
  await inflate(resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter((arg) => arg !== '--disable-web-security'), headless: true, env: { ...process.env } });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ownerContext.newPage(); watch(page);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'A cleaner car. A better day.' }).waitFor();
  assert.equal(await page.locator('.service-card').count(), 6);
  assert.match(await page.locator('.demo-notice').innerText(), /demo/);
  await noOverflow(page);
  await page.screenshot({ path: join(screenshots, 'desktop.png'), fullPage: true });
  console.log('PASS desktop layout, six services and explicit demo notice');

  await page.getByRole('button', { name: 'Choose Complete care, ₹350' }).click();
  await chooseSlot(page);
  await page.getByLabel('Your name', { exact: false }).fill('Must Not Be Stored');
  await page.getByLabel('Anything we should know?').fill('Private demo note');
  await page.locator('.consent-label input').check();
  await page.getByRole('button', { name: 'Create demo booking' }).click();
  await page.getByRole('heading', { name: 'That’s how easy it is.' }).waitFor();
  assert.equal(await page.locator('.booking-success .button-whatsapp').count(), 0);
  const demoResponse = await page.request.get(`${base}/api/demo/bookings?date=${tomorrow}`);
  const demoDay = await demoResponse.json();
  assert.ok(demoDay.bookings.some((b) => b.name === 'Demo guest' && b.phone === '' && b.serviceName === 'Complete care'));
  assert.ok(!JSON.stringify(demoDay).includes('Must Not Be Stored'));
  assert.ok(!JSON.stringify(demoDay).includes('Private demo note'));
  await page.screenshot({ path: join(screenshots, 'demo-confirmation.png'), fullPage: true });
  console.log('PASS demo booking, dashboard storage and personal-data redaction');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobile = await mobileContext.newPage(); watch(mobile);
  await mobile.goto(base, { waitUntil: 'networkidle' });
  await noOverflow(mobile);
  await mobile.screenshot({ path: join(screenshots, 'mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Open menu' }).click();
  await mobile.locator('#mobile-nav').getByRole('link', { name: 'Book a slot' }).click();
  assert.equal(await mobile.locator('#mobile-nav').count(), 0);
  await mobile.getByLabel('Your service', { exact: true }).selectOption('vip');
  await chooseSlot(mobile);
  await mobile.locator('.consent-label input').check();
  await mobile.getByRole('button', { name: 'Create demo booking' }).click();
  await mobile.getByRole('heading', { name: 'That’s how easy it is.' }).waitFor();
  await noOverflow(mobile);
  await mobile.getByRole('button', { name: 'Privacy & booking terms' }).click();
  await mobile.getByRole('dialog').waitFor();
  await mobile.getByRole('button', { name: 'Got it' }).click();
  assert.equal(await mobile.getByRole('dialog').count(), 0);
  console.log('PASS mobile navigation, VIP demo booking and privacy dialog');

  const admin = await ownerContext.newPage(); watch(admin);
  await admin.goto(`${base}/admin`, { waitUntil: 'networkidle' });
  await admin.getByLabel('Owner password').fill(password);
  await admin.getByRole('button', { name: 'Open my dashboard' }).click();
  await admin.getByRole('heading', { name: 'Your centre, at a glance.' }).waitFor();
  await admin.getByRole('button', { name: 'Shop settings' }).click();
  await admin.getByLabel('Opening time (IST)').fill('08:00');
  await admin.getByLabel('Closing time (IST)').fill('20:00');
  await admin.getByLabel('Vehicles at the same time').selectOption('2');
  await admin.locator('.live-toggle input').check();
  await admin.getByRole('button', { name: 'Save shop settings' }).click();
  await admin.getByText('Settings saved successfully').waitFor();
  assert.equal((await (await admin.request.get(`${base}/api/meta`)).json()).live, true);
  await admin.screenshot({ path: join(screenshots, 'owner-settings.png'), fullPage: true });
  console.log('PASS protected owner login and saving a live schedule');

  await page.goto(`${base}/#book`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.demo-notice').count(), 0);
  await chooseSlot(page);
  await page.getByLabel('Your name', { exact: false }).fill('UI Test Customer');
  await page.getByLabel('WhatsApp number', { exact: false }).fill('9876543210');
  await page.getByLabel('Car model / registration number', { exact: false }).fill('UI Test Car');
  await page.locator('.consent-label input').check();
  await page.getByRole('button', { name: 'Reserve & continue' }).click();
  await page.getByRole('heading', { name: 'Your slot is on hold.' }).waitFor();
  const whatsapp = await page.locator('.booking-success .button-whatsapp').getAttribute('href');
  const whatsappUrl = new URL(whatsapp);
  assert.equal(whatsappUrl.pathname, '/917970000601');
  assert.match(whatsappUrl.searchParams.get('text'), /UI Test Customer/);
  assert.match(whatsappUrl.searchParams.get('text'), /₹150/);
  assert.match(whatsappUrl.searchParams.get('text'), /IST/);
  await page.screenshot({ path: join(screenshots, 'live-whatsapp-step.png'), fullPage: true });
  console.log('PASS live reservation and correctly addressed WhatsApp message (not sent)');

  await admin.getByRole('button', { name: 'Bookings', exact: true }).click();
  await admin.getByLabel('Booking list date').fill(tomorrow);
  await admin.getByRole('button', { name: 'Refresh', exact: true }).click();
  const record = admin.locator('.booking-record').filter({ hasText: 'UI Test Customer' });
  await record.waitFor();
  await record.getByRole('button', { name: 'Confirm', exact: true }).click();
  await record.getByText('Confirmed', { exact: true }).waitFor();
  const csv = await admin.request.get(`${base}/api/admin/export?date=${tomorrow}&format=csv`);
  assert.match(await csv.text(), /UI Test Customer/);
  const calendar = await admin.request.get(`${base}/api/admin/export?date=${tomorrow}&format=ics`);
  assert.match(await calendar.text(), /BEGIN:VCALENDAR/);
  await admin.screenshot({ path: join(screenshots, 'owner-bookings.png'), fullPage: true });
  admin.once('dialog', (dialog) => dialog.accept());
  await record.getByRole('button', { name: 'Cancel', exact: true }).click();
  await record.getByText('Cancelled', { exact: true }).waitFor();
  admin.once('dialog', (dialog) => dialog.accept());
  await record.getByRole('button', { name: 'Delete details' }).click();
  await record.waitFor({ state: 'hidden' });
  console.log('PASS owner confirmation, CSV/calendar exports, cancellation and data deletion');

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log(`All browser checks passed. Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  await rm(dataDir, { recursive: true, force: true });
}
