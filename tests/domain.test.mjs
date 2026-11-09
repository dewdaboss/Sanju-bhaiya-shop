import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CATALOG, SERVICES, DEMO_SETTINGS, parseSettings, validateBooking, shopDate, dateOffset, bookingMessage, csvCell, bookingsIcs } from '../server/domain.mjs';
import { BookingStore } from '../server/store.mjs';

const now = new Date('2026-11-09T03:30:00Z'); // 09:00 IST
const date = '2026-11-10';
const input = (overrides = {}) => ({ name: 'Rahul Sharma', phone: '9876543210', vehicle: 'Swift', note: '', date, time: '09:30', serviceId: 'car-wash', consent: true, requestId: randomUUID(), ...overrides });
const storeTest = (t, settings = DEMO_SETTINGS) => { const store = new BookingStore(':memory:'); t.after(() => store.close()); return { store, settings: parseSettings(settings) }; };

test('poster prices and complete package agree', () => {
  assert.equal(SERVICES.length, 6);
  assert.deepEqual(SERVICES.map((s) => s.price), [150, 50, 100, 50, 350, 600]);
  assert.equal(SERVICES.slice(0, 4).reduce((sum, s) => sum + s.price, 0), 350);
  assert.equal(CATALOG.business.whatsapp, '917970000601');
  assert.ok(CATALOG.askAtCentre.includes('Bike wash'));
});

test('India date boundary does not shift a day', () => {
  assert.equal(shopDate(new Date('2026-11-08T18:29:59Z')), '2026-11-08');
  assert.equal(shopDate(new Date('2026-11-08T18:30:00Z')), '2026-11-09');
  assert.equal(dateOffset('2026-12-31', 1), '2027-01-01');
});

test('settings require real valid hours, durations and explicit live state', () => {
  assert.throws(() => parseSettings({ ...DEMO_SETTINGS, closing: '08:00' }), (e) => e.status === 400 && !!e.fields.hours);
  assert.throws(() => parseSettings({ ...DEMO_SETTINGS, durations: {} }), (e) => e.status === 400);
  assert.throws(() => parseSettings({ ...DEMO_SETTINGS, live: 'yes' }), (e) => e.status === 400);
  assert.throws(() => parseSettings({ ...DEMO_SETTINGS, capacity: 0 }), (e) => e.status === 400);
  assert.equal(parseSettings(DEMO_SETTINGS).leadMinutes, 15);
});

test('booking validation normalizes Indian phones and rejects unsafe or incomplete input', () => {
  assert.equal(validateBooking(input({ phone: '+91 98765-43210' }), now).phone, '+919876543210');
  for (const patch of [{ phone: '12345' }, { consent: false }, { serviceId: 'free-car' }, { date: '2026-02-30' }, { date: '2026-11-08' }, { date: dateOffset(shopDate(now), 61) }, { time: '25:00' }, { name: 'A' }, { company: 'spam' }]) {
    assert.throws(() => validateBooking(input(patch), now), (e) => e.status === 400);
  }
});

test('last slot finishes before closing and lead time hides immediate starts', (t) => {
  const { store, settings } = storeTest(t);
  const vip = store.availability(settings, date, 'vip', 'real', now);
  assert.equal(vip.slots.at(-1).time, '16:30');
  assert.equal(vip.slots.at(-1).endTime, '19:00');
  const car = store.availability(settings, date, 'car-wash', 'real', now);
  assert.equal(car.slots.at(-1).endTime, '18:45');
  const todayAvailability = store.availability(settings, shopDate(now), 'car-wash', 'real', now);
  assert.equal(todayAvailability.slots[0].available, false);
  assert.equal(todayAvailability.slots[0].reason, 'past');
  assert.equal(todayAvailability.slots[1].available, true);
});

test('weekly off returns no slots', (t) => {
  const { store, settings } = storeTest(t, { ...DEMO_SETTINGS, weeklyOff: [2] });
  const result = store.availability(settings, date, 'car-wash', 'real', now);
  assert.equal(result.slots.length, 0);
  assert.match(result.closedReason, /closed/);
});

test('overlapping services block a single bay, adjacent services do not', (t) => {
  const { store, settings } = storeTest(t, { ...DEMO_SETTINGS, slotMinutes: 15 });
  store.createBooking(validateBooking(input(), now), settings, 'real', now);
  const slots = store.availability(settings, date, 'car-wash', 'real', now).slots;
  assert.equal(slots.find((s) => s.time === '09:30').available, false);
  assert.equal(slots.find((s) => s.time === '10:00').available, false);
  assert.equal(slots.find((s) => s.time === '10:15').available, true);
  assert.throws(() => store.createBooking(validateBooking(input(), now), settings, 'real', now), (e) => e.status === 409);
});

test('capacity allows exactly the configured number of overlapping vehicles', (t) => {
  const { store, settings } = storeTest(t, { ...DEMO_SETTINGS, capacity: 2 });
  store.createBooking(validateBooking(input(), now), settings, 'real', now);
  store.createBooking(validateBooking(input(), now), settings, 'real', now);
  assert.throws(() => store.createBooking(validateBooking(input(), now), settings, 'real', now), (e) => e.status === 409);
});

test('idempotent retries do not create a second reservation', (t) => {
  const { store, settings } = storeTest(t);
  const value = validateBooking(input(), now);
  const first = store.createBooking(value, settings, 'real', now);
  const second = store.createBooking(value, settings, 'real', now);
  assert.equal(first.booking.reference, second.booking.reference);
  assert.equal(second.replay, true);
  assert.equal(store.listBookings(date, 'real', now).length, 1);
});

test('unconfirmed holds expire, cancellation frees a slot, closed records stay closed', (t) => {
  const { store, settings } = storeTest(t);
  const { booking } = store.createBooking(validateBooking(input(), now), settings, 'real', now);
  const later = new Date(now.getTime() + 16 * 60_000);
  assert.equal(store.listBookings(date, 'real', later)[0].status, 'cancelled');
  assert.equal(store.availability(settings, date, 'car-wash', 'real', later).slots.find((s) => s.time === '09:30').available, true);
  assert.throws(() => store.updateStatus(booking.id, 'confirmed', 'real', later), (e) => e.status === 409);
  const next = store.createBooking(validateBooking(input(), later), settings, 'real', later).booking;
  store.updateStatus(next.id, 'confirmed', 'real', later);
  store.updateStatus(next.id, 'completed', 'real', later);
  assert.throws(() => store.updateStatus(next.id, 'confirmed', 'real', later), (e) => e.status === 409);
  assert.throws(() => store.deleteBooking(next.id), (e) => e.status === 409);
  store.deleteBooking(booking.id);
  assert.equal(store.listBookings(date, 'real', later).length, 1);
});

test('demo seeds are fictional, unique and isolated from real bookings', (t) => {
  const { store } = storeTest(t);
  store.seedDemo(now);
  store.seedDemo(now);
  assert.equal(store.listBookings(shopDate(now), 'demo', now).length, 3);
  assert.equal(store.listBookings(shopDate(now), 'real', now).length, 0);
  assert.ok(store.listBookings(shopDate(now), 'demo', now).every((b) => b.phone === ''));
});

test('WhatsApp message includes date, time, price and customer details', () => {
  const message = bookingMessage({ reference: 'IC-TEST', date, time: '09:30', endTime: '10:15', serviceName: 'Car wash', price: 150, name: 'Rahul', phone: '+919876543210', vehicle: 'Swift', note: 'Extra care' });
  for (const value of ['10 November 2026', '9:30 AM', '10:15 AM', '₹150', 'Rahul', '+919876543210', 'Swift', 'Extra care', 'please confirm']) assert.ok(message.includes(value));
});

test('CSV neutralizes spreadsheet formulas and ICS folds safely', () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.ok(csvCell('+919876543210').startsWith('"\'+91'));
  const calendar = bookingsIcs([{ reference: 'IC-TEST', updatedAt: now.toISOString(), startAt: '2026-11-10T04:00:00Z', endAt: '2026-11-10T04:45:00Z', serviceName: 'Car wash', name: 'राहुल '.repeat(30), vehicle: 'Swift', phone: '+919876543210', status: 'confirmed', price: 150 }]);
  assert.ok(calendar.includes('DTSTART:20261110T040000Z'));
  assert.ok(calendar.includes('STATUS:CONFIRMED'));
  assert.ok(calendar.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
});
