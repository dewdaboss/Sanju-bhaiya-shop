import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { BookingStore } from '../server/store.mjs';
import { DEMO_SETTINGS } from '../server/domain.mjs';

const now = new Date('2026-11-09T03:30:00Z');
const date = '2026-11-10';
const password = 'private-test-password';
async function harness(t, adminPassword = password) {
  const store = new BookingStore(':memory:');
  store.seedDemo(now);
  const app = createApp({ store, adminPassword, now: () => now });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, headers: { 'X-Requested-With': 'XMLHttpRequest', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
    return { response, data };
  };
  const login = async () => {
    const result = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
    assert.equal(result.response.status, 200);
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  const goLive = async (cookie) => {
    const result = await request('/api/admin/settings', { method: 'PUT', headers: { cookie }, body: JSON.stringify(DEMO_SETTINGS) });
    assert.equal(result.response.status, 200);
  };
  return { store, request, login, goLive };
}
const bookingBody = (overrides = {}) => JSON.stringify({ name: 'Test Customer', phone: '9876543210', vehicle: 'Test Swift', note: '', date, time: '09:30', serviceId: 'car-wash', consent: true, requestId: randomUUID(), ...overrides });

test('unconfigured site is explicitly demo and refuses real reservations', async (t) => {
  const { request } = await harness(t, '');
  const meta = await request('/api/meta');
  assert.equal(meta.data.live, false);
  assert.equal(meta.data.demoAvailable, true);
  assert.equal(meta.data.adminEnabled, false);
  assert.equal((await request('/api/availability?date=2026-11-10&serviceId=car-wash')).response.status, 503);
  assert.equal((await request('/api/bookings', { method: 'POST', body: bookingBody() })).response.status, 503);
  assert.equal((await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) })).response.status, 503);
});

test('demo reservations discard personal details and never return a shop WhatsApp link', async (t) => {
  const { request, store } = await harness(t);
  const result = await request('/api/demo/bookings', { method: 'POST', body: bookingBody({ name: 'Private Person', phone: '', vehicle: '', note: 'private note' }) });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.demo, true);
  assert.equal(result.data.whatsappUrl, null);
  assert.equal(result.data.booking.name, 'Demo guest');
  assert.equal(result.data.booking.phone, '');
  assert.equal(result.data.booking.vehicle, 'Demo vehicle');
  assert.ok(!JSON.stringify(result.data).includes('private note'));
  assert.equal(store.listBookings(date, 'real', now).length, 0);
  assert.equal((await request('/api/admin/bookings?date=' + date)).response.status, 401);
});

test('owner authentication protects private booking data and settings', async (t) => {
  const { request, login } = await harness(t);
  assert.equal((await request('/api/admin/bookings?date=' + date)).response.status, 401);
  assert.equal((await request('/api/admin/settings')).response.status, 401);
  assert.equal((await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })).response.status, 401);
  const cookie = await login();
  assert.equal((await request('/api/admin/session', { headers: { cookie } })).data.authenticated, true);
  const privateList = await request('/api/admin/bookings?date=' + date, { headers: { cookie } });
  assert.equal(privateList.response.status, 200);
  assert.equal(privateList.data.demo, false);
  assert.equal(privateList.data.bookings.length, 0);
  await request('/api/admin/logout', { method: 'POST', headers: { cookie } });
  assert.equal((await request('/api/admin/bookings?date=' + date, { headers: { cookie } })).response.status, 401);
});

test('login cookie is HttpOnly and SameSite Strict', async (t) => {
  const { request } = await harness(t);
  const result = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
  const cookie = result.response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Max-Age=28800/i);
});

test('live settings switch atomically from demo to real bookings', async (t) => {
  const { request, login, goLive } = await harness(t);
  const cookie = await login();
  await goLive(cookie);
  const meta = await request('/api/meta');
  assert.equal(meta.data.live, true);
  assert.equal(meta.data.demoAvailable, false);
  assert.equal((await request('/api/demo/bookings?date=' + date)).response.status, 404);
  const created = await request('/api/bookings', { method: 'POST', body: bookingBody() });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.demo, false);
  const url = new URL(created.data.whatsappUrl);
  assert.equal(url.hostname, 'wa.me');
  assert.equal(url.pathname, '/917970000601');
  assert.match(url.searchParams.get('text'), /10 November 2026/);
  assert.match(url.searchParams.get('text'), /9:30 AM/);
  const list = await request('/api/admin/bookings?date=' + date, { headers: { cookie } });
  assert.equal(list.data.stats.pending, 1);
  const id = created.data.booking.id;
  const confirmed = await request(`/api/admin/bookings/${id}`, { method: 'PATCH', headers: { cookie }, body: JSON.stringify({ status: 'confirmed' }) });
  assert.equal(confirmed.data.booking.status, 'confirmed');
  const dayList = await request('/api/admin/whatsapp-list?date=' + date, { headers: { cookie } });
  assert.match(decodeURIComponent(dayList.data.url), /Test Customer/);
  assert.equal((await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(DEMO_SETTINGS) })).response.status, 401);
});

test('exports require owner access and return CSV and calendar files', async (t) => {
  const { request, login, goLive } = await harness(t);
  assert.equal((await request('/api/admin/export?date=' + date)).response.status, 401);
  const cookie = await login(); await goLive(cookie);
  await request('/api/bookings', { method: 'POST', body: bookingBody() });
  const csv = await request('/api/admin/export?date=' + date + '&format=csv', { headers: { cookie } });
  assert.match(csv.response.headers.get('content-type'), /text\/csv/);
  assert.match(csv.data, /Test Customer/);
  assert.ok(csv.data.includes('"\'+919876543210"'));
  const ics = await request('/api/admin/export?date=' + date + '&format=ics', { headers: { cookie } });
  assert.match(ics.response.headers.get('content-type'), /text\/calendar/);
  assert.ok(ics.data.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.data.includes('DTSTART:20261110T040000Z'));
});

test('cross-site mutations and missing admin verification headers are rejected', async (t) => {
  const { request, login } = await harness(t);
  assert.equal((await request('/api/demo/bookings', { method: 'POST', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, body: bookingBody() })).response.status, 403);
  const cookie = await login();
  assert.equal((await request('/api/admin/settings', { method: 'PUT', headers: { cookie, 'X-Requested-With': '' }, body: JSON.stringify(DEMO_SETTINGS) })).response.status, 403);
});

test('bad JSON and unknown API routes never leak stack traces', async (t) => {
  const { request } = await harness(t);
  const bad = await request('/api/demo/bookings', { method: 'POST', body: '{bad' });
  assert.equal(bad.response.status, 400);
  assert.equal(bad.data.error, 'Invalid JSON request.');
  const missing = await request('/api/not-a-route');
  assert.equal(missing.response.status, 404);
  assert.ok(!JSON.stringify(missing.data).includes(' at '));
});
