import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SERVICES, DEMO_SETTINGS, HttpError, HOLD_MINUTES, minutes, timeString, instant, shopDate, dateOffset, validDate } from './domain.mjs';

const TABLES = { real: 'bookings', demo: 'demo_bookings' };
function tableName(mode) {
  const name = TABLES[mode];
  if (!name) throw new Error('Unknown booking store');
  return name;
}
function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id, reference: row.reference, requestId: row.request_id,
    serviceId: row.service_id, serviceName: row.service_name, name: row.name,
    phone: row.phone, vehicle: row.vehicle, note: row.note, date: row.date,
    time: row.time, endTime: row.end_time, startAt: row.start_at, endAt: row.end_at,
    minutes: row.minutes, price: row.price, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class BookingStore {
  constructor(directory = './data') {
    if (directory !== ':memory:') mkdirSync(resolve(directory), { recursive: true });
    this.db = new DatabaseSync(directory === ':memory:' ? directory : resolve(directory, 'shop.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    for (const table of Object.values(TABLES)) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL UNIQUE,
        service_id TEXT NOT NULL, service_name TEXT NOT NULL,
        name TEXT NOT NULL, phone TEXT NOT NULL, vehicle TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL, time TEXT NOT NULL, end_time TEXT NOT NULL,
        start_at TEXT NOT NULL, end_at TEXT NOT NULL, minutes INTEGER NOT NULL, price INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('awaiting_whatsapp','confirmed','completed','cancelled')),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ); CREATE INDEX IF NOT EXISTS idx_${table}_date ON ${table}(date, status);
      CREATE INDEX IF NOT EXISTS idx_${table}_overlap ON ${table}(start_at, end_at, status);`);
    }
  }

  getSettings() {
    const row = this.db.prepare('SELECT value FROM settings WHERE id=1').get();
    return row ? JSON.parse(row.value) : null;
  }

  saveSettings(settings) {
    this.db.prepare('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(settings));
    return settings;
  }

  expirePending(mode = 'real', now = new Date()) {
    const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000).toISOString();
    this.db.prepare(`UPDATE ${tableName(mode)} SET status='cancelled', updated_at=? WHERE status='awaiting_whatsapp' AND created_at < ?`).run(now.toISOString(), cutoff);
  }

  availability(settings, date, serviceId, mode = 'real', now = new Date()) {
    const service = SERVICES.find((s) => s.id === serviceId);
    if (!service) throw new HttpError(400, 'Choose a service from the menu.');
    if (!validDate(date) || date < shopDate(now) || date > dateOffset(shopDate(now), 60)) throw new HttpError(400, 'Choose a date within the next 60 days.');
    this.expirePending(mode, now);
    const duration = settings.durations[serviceId];
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const base = { date, serviceId, minutes: duration, opening: settings.opening, closing: settings.closing, capacity: settings.capacity, slots: [], closedReason: '' };
    if (settings.weeklyOff.includes(day)) return { ...base, closedReason: 'The centre is closed on this day. Please choose another date.' };
    const rows = this.db.prepare(`SELECT start_at,end_at FROM ${tableName(mode)} WHERE date=? AND status!='cancelled'`).all(date);
    const earliest = now.getTime() + settings.leadMinutes * 60_000;
    for (let start = minutes(settings.opening); start + duration <= minutes(settings.closing); start += settings.slotMinutes) {
      const end = start + duration;
      const startAt = instant(date, timeString(start)).getTime();
      const endAt = instant(date, timeString(end)).getTime();
      const used = rows.filter((r) => Date.parse(r.start_at) < endAt && Date.parse(r.end_at) > startAt).length;
      const remaining = Math.max(0, settings.capacity - used);
      const past = startAt < earliest;
      base.slots.push({ time: timeString(start), endTime: timeString(end), remaining, available: !past && remaining > 0, reason: past ? 'past' : remaining === 0 ? 'full' : '' });
    }
    if (!base.slots.length) base.closedReason = 'This service is longer than the working day. Please ask the centre about a suitable time.';
    return base;
  }

  createBooking(input, settings, mode = 'real', now = new Date()) {
    const table = tableName(mode);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = rowToBooking(this.db.prepare(`SELECT * FROM ${table} WHERE request_id=?`).get(input.requestId));
      if (previous) { this.db.exec('COMMIT'); return { booking: previous, replay: true }; }
      if (!settings?.live) throw new HttpError(503, 'Online bookings are not open yet. Please contact the centre.');
      const availability = this.availability(settings, input.date, input.serviceId, mode, now);
      const slot = availability.slots.find((s) => s.time === input.time);
      if (!slot?.available) throw new HttpError(409, slot?.reason === 'full' ? 'That slot was just taken. Please choose another time.' : 'That time is no longer available. Please choose another slot.');
      const service = SERVICES.find((s) => s.id === input.serviceId);
      let reference;
      do { reference = `IC-${randomBytes(4).toString('hex').toUpperCase()}`; } while (this.db.prepare(`SELECT id FROM ${table} WHERE reference=?`).get(reference));
      const timestamp = now.toISOString();
      const result = this.db.prepare(`INSERT INTO ${table}
        (reference,request_id,service_id,service_name,name,phone,vehicle,note,date,time,end_time,start_at,end_at,minutes,price,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'awaiting_whatsapp',?,?)`)
        .run(reference, input.requestId, service.id, service.name, input.name, input.phone, input.vehicle, input.note,
          input.date, input.time, slot.endTime, instant(input.date, input.time).toISOString(), instant(input.date, slot.endTime).toISOString(),
          availability.minutes, service.price, timestamp, timestamp);
      const booking = rowToBooking(this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(result.lastInsertRowid)));
      this.db.exec('COMMIT');
      return { booking, replay: false };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listBookings(date, mode = 'real', now = new Date()) {
    if (!validDate(date)) throw new HttpError(400, 'A valid date is required.');
    this.expirePending(mode, now);
    return this.db.prepare(`SELECT * FROM ${tableName(mode)} WHERE date=? ORDER BY time,id`).all(date).map(rowToBooking);
  }

  updateStatus(id, status, mode = 'real', now = new Date()) {
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid booking ID.');
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid booking status.');
    const table = tableName(mode);
    const current = rowToBooking(this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
    if (!current) throw new HttpError(404, 'Booking not found.');
    if (current.status === 'cancelled' || (current.status === 'completed' && status !== 'completed')) throw new HttpError(409, 'This booking is already closed. Create a new booking instead.');
    this.db.prepare(`UPDATE ${table} SET status=?,updated_at=? WHERE id=?`).run(status, now.toISOString(), id);
    return rowToBooking(this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
  }

  deleteBooking(id, mode = 'real') {
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid booking ID.');
    const table = tableName(mode);
    const booking = rowToBooking(this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'cancelled') throw new HttpError(409, 'Cancel the booking before deleting its personal details.');
    this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }

  seedDemo(now = new Date()) {
    const today = shopDate(now);
    if (this.db.prepare('SELECT value FROM metadata WHERE key=?').get('demo_seed_date')?.value === today) return;
    const examples = [
      { name: 'Demo customer A', vehicle: 'DEMO — Swift', serviceId: 'car-wash', time: '10:00', status: 'confirmed' },
      { name: 'Demo customer B', vehicle: 'DEMO — Creta', serviceId: 'complete', time: '11:30', status: 'awaiting_whatsapp' },
      { name: 'Demo customer C', vehicle: 'DEMO — Nexon', serviceId: 'vip', time: '14:00', status: 'confirmed' },
    ];
    for (const example of examples) {
      const service = SERVICES.find((s) => s.id === example.serviceId);
      const duration = DEMO_SETTINGS.durations[example.serviceId];
      const endTime = timeString(minutes(example.time) + duration);
      const requestId = `00000000-0000-4000-8000-${today.replaceAll('-', '').slice(2)}${String(examples.indexOf(example)).padStart(6, '0')}`;
      this.db.prepare(`INSERT OR IGNORE INTO demo_bookings
        (reference,request_id,service_id,service_name,name,phone,vehicle,note,date,time,end_time,start_at,end_at,minutes,price,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(`DEMO-${today.replaceAll('-', '')}-${examples.indexOf(example) + 1}`, requestId, service.id, service.name, example.name, '', example.vehicle,
          'Fictional example — not a real customer', today, example.time, endTime, instant(today, example.time).toISOString(), instant(today, endTime).toISOString(), duration, service.price, example.status, now.toISOString(), now.toISOString());
    }
    this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('demo_seed_date', today);
  }

  close() { this.db.close(); }
}
