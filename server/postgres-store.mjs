import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { SERVICES, DEMO_SETTINGS, HttpError, HOLD_MINUTES, minutes, timeString, instant, shopDate, validDate, buildAvailability } from './domain.mjs';

const TABLES = { real: 'bookings', demo: 'demo_bookings' };
const LOCK_NAMESPACE = 74210;
const lockKey = (mode) => mode === 'real' ? 1 : mode === 'demo' ? 2 : 3;
function tableName(mode) {
  const name = TABLES[mode];
  if (!name) throw new Error('Unknown booking store');
  return name;
}
function rowToBooking(row) {
  if (!row) return null;
  return {
    id: Number(row.id), reference: row.reference, requestId: row.request_id,
    serviceId: row.service_id, serviceName: row.service_name, name: row.name,
    phone: row.phone, vehicle: row.vehicle, note: row.note, date: row.date,
    time: row.time, endTime: row.end_time, startAt: row.start_at, endAt: row.end_at,
    minutes: row.minutes, price: row.price, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL, service_name TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, vehicle TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL, time TEXT NOT NULL, end_time TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, minutes INTEGER NOT NULL, price INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('awaiting_whatsapp','confirmed','completed','cancelled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_overlap ON bookings(start_at, end_at, status);
CREATE TABLE IF NOT EXISTS demo_bookings (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL, service_name TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, vehicle TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL, time TEXT NOT NULL, end_time TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, minutes INTEGER NOT NULL, price INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('awaiting_whatsapp','confirmed','completed','cancelled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_bookings_date ON demo_bookings(date, status);
CREATE INDEX IF NOT EXISTS idx_demo_bookings_overlap ON demo_bookings(start_at, end_at, status);
`;

export class PostgresStore {
  constructor(connectionStringOrPool) {
    if (typeof connectionStringOrPool === 'string') {
      const url = new URL(connectionStringOrPool);
      const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
      const ssl = local || url.searchParams.get('sslmode') === 'disable' ? false : { rejectUnauthorized: true };
      this.pool = new pg.Pool({ connectionString: connectionStringOrPool, ssl, max: 1, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000, allowExitOnIdle: true });
      this.pool.on('error', (error) => console.error('Postgres pool error:', error.message));
    } else {
      this.pool = connectionStringOrPool;
    }
  }

  async init() {
    if (typeof this.pool.exec === 'function') await this.pool.exec(SCHEMA);
    else await this.pool.query(SCHEMA);
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async getSettings() {
    const result = await this.pool.query('SELECT value FROM settings WHERE id=1');
    return result.rows[0] ? JSON.parse(result.rows[0].value) : null;
  }

  async saveSettings(settings) {
    await this.pool.query('INSERT INTO settings(id,value) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET value=excluded.value', [JSON.stringify(settings)]);
    return settings;
  }

  async expirePendingWith(queryable, mode, now) {
    const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000).toISOString();
    await queryable.query(`UPDATE ${tableName(mode)} SET status='cancelled', updated_at=$1 WHERE status='awaiting_whatsapp' AND created_at < $2`, [now.toISOString(), cutoff]);
  }

  async expirePending(mode = 'real', now = new Date()) {
    await this.expirePendingWith(this.pool, mode, now);
  }

  async availability(settings, date, serviceId, mode = 'real', now = new Date()) {
    await this.expirePending(mode, now);
    const result = await this.pool.query(`SELECT start_at,end_at FROM ${tableName(mode)} WHERE date=$1 AND status!='cancelled'`, [date]);
    return buildAvailability(settings, date, serviceId, result.rows, now);
  }

  async createBooking(input, settings, mode = 'real', now = new Date()) {
    const table = tableName(mode);
    return this.transaction(async (client) => {
      // One short transaction-level lock per booking mode prevents double booking across serverless instances.
      await client.query('SELECT pg_advisory_xact_lock($1::int,$2::int)', [LOCK_NAMESPACE, lockKey(mode)]);
      const previous = await client.query(`SELECT * FROM ${table} WHERE request_id=$1`, [input.requestId]);
      if (previous.rows[0]) return { booking: rowToBooking(previous.rows[0]), replay: true };
      let effective = settings;
      if (mode === 'real') {
        const current = await client.query('SELECT value FROM settings WHERE id=1');
        effective = current.rows[0] ? JSON.parse(current.rows[0].value) : null;
        if (!effective?.live) throw new HttpError(503, 'Online bookings are not open yet. Please contact the centre.');
      }
      await this.expirePendingWith(client, mode, now);
      const rows = await client.query(`SELECT start_at,end_at FROM ${table} WHERE date=$1 AND status!='cancelled'`, [input.date]);
      const availability = buildAvailability(effective, input.date, input.serviceId, rows.rows, now);
      const slot = availability.slots.find((s) => s.time === input.time);
      if (!slot?.available) throw new HttpError(409, slot?.reason === 'full' ? 'That slot was just taken. Please choose another time.' : 'That time is no longer available. Please choose another slot.');
      const service = SERVICES.find((s) => s.id === input.serviceId);
      let reference;
      do {
        reference = `IC-${randomBytes(4).toString('hex').toUpperCase()}`;
      } while ((await client.query(`SELECT id FROM ${table} WHERE reference=$1`, [reference])).rows.length);
      const timestamp = now.toISOString();
      const inserted = await client.query(`INSERT INTO ${table}
        (reference,request_id,service_id,service_name,name,phone,vehicle,note,date,time,end_time,start_at,end_at,minutes,price,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'awaiting_whatsapp',$16,$17) RETURNING *`,
        [reference, input.requestId, service.id, service.name, input.name, input.phone, input.vehicle, input.note,
          input.date, input.time, slot.endTime, instant(input.date, input.time).toISOString(), instant(input.date, slot.endTime).toISOString(),
          availability.minutes, service.price, timestamp, timestamp]);
      return { booking: rowToBooking(inserted.rows[0]), replay: false };
    });
  }

  async listBookings(date, mode = 'real', now = new Date()) {
    if (!validDate(date)) throw new HttpError(400, 'A valid date is required.');
    await this.expirePending(mode, now);
    const result = await this.pool.query(`SELECT * FROM ${tableName(mode)} WHERE date=$1 ORDER BY time,id`, [date]);
    return result.rows.map(rowToBooking);
  }

  async updateStatus(id, status, mode = 'real', now = new Date()) {
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid booking ID.');
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid booking status.');
    const table = tableName(mode);
    return this.transaction(async (client) => {
      await this.expirePendingWith(client, mode, now);
      const current = await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
      const booking = rowToBooking(current.rows[0]);
      if (!booking) throw new HttpError(404, 'Booking not found.');
      if (booking.status === 'cancelled' || (booking.status === 'completed' && status !== 'completed')) throw new HttpError(409, 'This booking is already closed. Create a new booking instead.');
      const updated = await client.query(`UPDATE ${table} SET status=$1,updated_at=$2 WHERE id=$3 RETURNING *`, [status, now.toISOString(), id]);
      return rowToBooking(updated.rows[0]);
    });
  }

  async deleteBooking(id, mode = 'real') {
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid booking ID.');
    const table = tableName(mode);
    await this.transaction(async (client) => {
      const current = await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
      const booking = rowToBooking(current.rows[0]);
      if (!booking) throw new HttpError(404, 'Booking not found.');
      if (booking.status !== 'cancelled') throw new HttpError(409, 'Cancel the booking before deleting its personal details.');
      await client.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
    });
  }

  async seedDemo(now = new Date()) {
    const today = shopDate(now);
    await this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1::int,$2::int)', [LOCK_NAMESPACE, lockKey('seed')]);
      const seeded = await client.query('SELECT value FROM metadata WHERE key=$1', ['demo_seed_date']);
      if (seeded.rows[0]?.value === today) return;
      const examples = [
        { name: 'Demo customer A', vehicle: 'DEMO — Swift', serviceId: 'car-wash', time: '10:00', status: 'confirmed' },
        { name: 'Demo customer B', vehicle: 'DEMO — Creta', serviceId: 'complete', time: '11:30', status: 'awaiting_whatsapp' },
        { name: 'Demo customer C', vehicle: 'DEMO — Nexon', serviceId: 'vip', time: '14:00', status: 'confirmed' },
      ];
      for (const [index, example] of examples.entries()) {
        const service = SERVICES.find((s) => s.id === example.serviceId);
        const duration = DEMO_SETTINGS.durations[example.serviceId];
        const endTime = timeString(minutes(example.time) + duration);
        const requestId = `00000000-0000-4000-8000-${today.replaceAll('-', '').slice(2)}${String(index).padStart(6, '0')}`;
        await client.query(`INSERT INTO demo_bookings
          (reference,request_id,service_id,service_name,name,phone,vehicle,note,date,time,end_time,start_at,end_at,minutes,price,status,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,'',$6,'Fictional example — not a real customer',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT DO NOTHING`,
          [`DEMO-${today.replaceAll('-', '')}-${index + 1}`, requestId, service.id, service.name, example.name, example.vehicle,
            today, example.time, endTime, instant(today, example.time).toISOString(), instant(today, endTime).toISOString(), duration, service.price, example.status, now.toISOString(), now.toISOString()]);
      }
      await client.query('INSERT INTO metadata(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', ['demo_seed_date', today]);
    });
  }

  async putSession(tokenHash, expiryIso) {
    await this.pool.query('INSERT INTO admin_sessions(token_hash,expires_at) VALUES($1,$2) ON CONFLICT(token_hash) DO UPDATE SET expires_at=excluded.expires_at', [tokenHash, expiryIso]);
  }

  async findSession(tokenHash) {
    const result = await this.pool.query('SELECT expires_at FROM admin_sessions WHERE token_hash=$1', [tokenHash]);
    return result.rows[0] || null;
  }

  async removeSession(tokenHash) {
    await this.pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [tokenHash]);
  }

  async pruneSessions(now = new Date()) {
    await this.pool.query('DELETE FROM admin_sessions WHERE expires_at <= $1', [now.toISOString()]);
  }

  async consumeRate(key, max, windowMs, now = new Date()) {
    const nowIso = now.toISOString();
    const reset = new Date(now.getTime() + windowMs).toISOString();
    const result = await this.pool.query(`INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at <= $3 THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= $3 THEN $2 ELSE rate_limits.reset_at END
      RETURNING count, reset_at`, [key, reset, nowIso]);
    const row = result.rows[0];
    return { allowed: row.count <= max, resetAt: row.reset_at };
  }

  async close() {
    if (typeof this.pool.end === 'function') await this.pool.end();
  }
}
