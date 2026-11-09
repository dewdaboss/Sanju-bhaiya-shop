import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStore } from '../server/postgres-store.mjs';
import { DEMO_SETTINGS, validateBooking, shopDate } from '../server/domain.mjs';

const now = new Date('2026-11-09T03:30:00Z');
const date = '2026-11-10';
const input = (overrides = {}) => validateBooking({ name: 'PG Customer', phone: '9876543210', vehicle: 'PG Swift', note: '', date, time: '09:30', serviceId: 'car-wash', consent: true, requestId: randomUUID(), ...overrides }, now);

async function makeStore(t) {
  const db = new PGlite();
  // PGlite is a real embedded Postgres engine. This adapter mimics a max=1 pg Pool.
  let tail = Promise.resolve();
  const query = async (sql, params) => {
    const result = params?.length ? await db.query(sql, params) : await db.query(sql);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = {
    query,
    exec: (sql) => db.exec(sql),
    connect: async () => {
      const previous = tail;
      let releaseLock;
      tail = new Promise((resolve) => { releaseLock = resolve; });
      await previous;
      return { query, release: () => releaseLock() };
    },
    end: () => db.close(),
  };
  const store = new PostgresStore(pool);
  await store.init();
  t.after(() => store.close());
  return store;
}

test('Postgres schema, settings and fictional demo seeds initialize', async (t) => {
  const store = await makeStore(t);
  assert.equal(await store.getSettings(), null);
  await store.saveSettings(DEMO_SETTINGS);
  assert.deepEqual(await store.getSettings(), DEMO_SETTINGS);
  await store.seedDemo(now);
  await store.seedDemo(now);
  const demos = await store.listBookings(shopDate(now), 'demo', now);
  assert.equal(demos.length, 3);
  assert.ok(demos.every((b) => b.phone === ''));
  assert.equal((await store.listBookings(shopDate(now), 'real', now)).length, 0);
});

test('Postgres reservations reject overlaps and replay idempotently', async (t) => {
  const store = await makeStore(t);
  await store.saveSettings(DEMO_SETTINGS);
  const value = input();
  const first = await store.createBooking(value, DEMO_SETTINGS, 'real', now);
  const replay = await store.createBooking(value, DEMO_SETTINGS, 'real', now);
  assert.equal(first.booking.reference, replay.booking.reference);
  assert.equal(replay.replay, true);
  await assert.rejects(() => store.createBooking(input(), DEMO_SETTINGS, 'real', now), (error) => error.status === 409);
  const slots = (await store.availability(DEMO_SETTINGS, date, 'car-wash', 'real', now)).slots;
  assert.equal(slots.find((s) => s.time === '09:30').available, false);
  assert.equal(slots.find((s) => s.time === '10:00').available, false);
  assert.equal(slots.find((s) => s.time === '10:30').available, true);
});

test('Postgres transaction serializes competing requests for the last slot', async (t) => {
  const store = await makeStore(t);
  await store.saveSettings(DEMO_SETTINGS);
  const results = await Promise.allSettled([
    store.createBooking(input(), DEMO_SETTINGS, 'real', now),
    store.createBooking(input(), DEMO_SETTINGS, 'real', now),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  assert.equal((await store.listBookings(date, 'real', now)).length, 1);
});

test('Postgres re-reads live settings inside the booking transaction', async (t) => {
  const store = await makeStore(t);
  await store.saveSettings(DEMO_SETTINGS);
  await store.saveSettings({ ...DEMO_SETTINGS, live: false });
  await assert.rejects(() => store.createBooking(input(), DEMO_SETTINGS, 'real', now), (error) => error.status === 503);
});

test('Postgres status transitions, expiry and deletion match the booking rules', async (t) => {
  const store = await makeStore(t);
  await store.saveSettings(DEMO_SETTINGS);
  const { booking } = await store.createBooking(input(), DEMO_SETTINGS, 'real', now);
  const later = new Date(now.getTime() + 16 * 60_000);
  assert.equal((await store.listBookings(date, 'real', later))[0].status, 'cancelled');
  await assert.rejects(() => store.updateStatus(booking.id, 'confirmed', 'real', later), (error) => error.status === 409);
  await store.deleteBooking(booking.id, 'real');
  assert.equal((await store.listBookings(date, 'real', later)).length, 0);
  const next = await store.createBooking(input(), DEMO_SETTINGS, 'real', later);
  await store.updateStatus(next.booking.id, 'confirmed', 'real', later);
  await store.updateStatus(next.booking.id, 'completed', 'real', later);
  await assert.rejects(() => store.deleteBooking(next.booking.id, 'real'), (error) => error.status === 409);
});

test('Postgres-backed sessions and rate limits are shared state', async (t) => {
  const store = await makeStore(t);
  await store.putSession('a'.repeat(64), new Date(now.getTime() + 60_000).toISOString());
  assert.ok(await store.findSession('a'.repeat(64)));
  await store.removeSession('a'.repeat(64));
  assert.equal(await store.findSession('a'.repeat(64)), null);
  assert.equal((await store.consumeRate('ip:/api/admin/login', 2, 60_000, now)).allowed, true);
  assert.equal((await store.consumeRate('ip:/api/admin/login', 2, 60_000, now)).allowed, true);
  assert.equal((await store.consumeRate('ip:/api/admin/login', 2, 60_000, now)).allowed, false);
  const later = new Date(now.getTime() + 61_000);
  assert.equal((await store.consumeRate('ip:/api/admin/login', 2, 60_000, later)).allowed, true);
});
