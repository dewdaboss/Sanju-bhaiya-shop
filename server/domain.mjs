import { readFileSync } from 'node:fs';

export const CATALOG = JSON.parse(readFileSync(new URL('../shared/catalog.json', import.meta.url), 'utf8'));
export const SERVICES = CATALOG.services;
export const DEMO_SETTINGS = { ...CATALOG.demoSettings, live: true };
export const HOLD_MINUTES = 15;
export const WINDOW_DAYS = 60;
export const STATUSES = ['awaiting_whatsapp', 'confirmed', 'completed', 'cancelled'];
const IST_OFFSET = 330 * 60_000;

export class HttpError extends Error {
  constructor(status, message, fields = undefined) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function timeString(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function shopDate(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dateOffset(date, days) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
}

export function instant(date, time) {
  return new Date(`${date}T${time}:00+05:30`);
}

export function prettyDate(date) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(instant(date, '12:00'));
}

export function prettyTime(time) {
  const m = minutes(time);
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`;
}

export function parseSettings(input) {
  const fields = {};
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Shop settings are required.');
  const validTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!validTime(input.opening) || !validTime(input.closing) || minutes(input.closing) <= minutes(input.opening)) {
    fields.hours = 'Enter valid opening and closing times. Closing must be later; overnight schedules are not supported.';
  }
  if (![15, 30, 60].includes(input.slotMinutes)) fields.slotMinutes = 'Choose a 15, 30 or 60 minute interval.';
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 4) fields.capacity = 'Capacity must be between 1 and 4 vehicles.';
  if (!Array.isArray(input.weeklyOff) || input.weeklyOff.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(input.weeklyOff).size !== input.weeklyOff.length) fields.weeklyOff = 'Choose valid, non-repeating weekly off days.';
  const durations = {};
  for (const service of SERVICES) {
    const value = input.durations?.[service.id];
    if (!Number.isInteger(value) || value < 5 || value > 480 || (!fields.hours && value > minutes(input.closing) - minutes(input.opening))) {
      fields[`duration_${service.id}`] = `${service.name}: enter 5–480 minutes, within one working day.`;
    } else durations[service.id] = value;
  }
  if (typeof input.live !== 'boolean') fields.live = 'Choose whether bookings are live or paused.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the shop settings.', fields);
  return {
    opening: input.opening, closing: input.closing, slotMinutes: input.slotMinutes,
    capacity: input.capacity, weeklyOff: [...input.weeklyOff].sort(), leadMinutes: 15,
    durations, live: input.live,
  };
}

export function validateBooking(raw, now = new Date(), { demo = false } = {}) {
  const fields = {};
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Booking details are required.');
  if (demo) raw = { ...raw, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Demo guest', phone: typeof raw.phone === 'string' && raw.phone.trim() ? raw.phone : '9000000000', vehicle: typeof raw.vehicle === 'string' && raw.vehicle.trim() ? raw.vehicle : 'Demo vehicle' };
  const clean = (v, max) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max + 1) : '';
  const name = clean(raw.name, 60);
  const vehicle = clean(raw.vehicle, 40);
  const note = typeof raw.note === 'string' ? raw.note.trim().replace(/\s+/g, ' ').slice(0, 241) : '';
  let phone = typeof raw.phone === 'string' ? raw.phone.replace(/[\s()\-]/g, '') : '';
  if (/^(\+91|91)\d{10}$/.test(phone)) phone = phone.slice(-10);
  if (name.length < 2 || name.length > 60 || /[\x00-\x1f]/.test(name)) fields.name = 'Please enter your name (2–60 characters).';
  if (!/^[6-9]\d{9}$/.test(phone)) fields.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (vehicle.length < 2 || vehicle.length > 40 || /[\x00-\x1f]/.test(vehicle)) fields.vehicle = 'Enter your car model or registration number (2–40 characters).';
  if (note.length > 240 || /[\x00-\x1f\x7f]/.test(note)) fields.note = 'Keep the note under 240 characters, without control characters.';
  if (!validDate(raw.date) || raw.date < shopDate(now) || raw.date > dateOffset(shopDate(now), WINDOW_DAYS)) fields.date = `Choose a date from today to ${WINDOW_DAYS} days ahead.`;
  if (typeof raw.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) fields.time = 'Choose an available time slot.';
  const service = SERVICES.find((s) => s.id === raw.serviceId);
  if (!service) fields.serviceId = 'Choose a service from the menu.';
  if (raw.consent !== true) fields.consent = 'Please agree to share these details with the centre.';
  if (typeof raw.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.requestId)) fields.requestId = 'Refresh the page and try again.';
  if (raw.company) throw new HttpError(400, 'Unable to create this booking.');
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check your booking details.', fields);
  return { name, phone: `+91${phone}`, vehicle, note, date: raw.date, time: raw.time, serviceId: service.id, requestId: raw.requestId.toLowerCase(), consent: true };
}

export function bookingMessage(booking, business = CATALOG.business) {
  return [
    `${business.fullName.toUpperCase()} — BOOKING REQUEST`,
    `Reference: ${booking.reference}`, '',
    `Date: ${prettyDate(booking.date)}`,
    `Time: ${prettyTime(booking.time)} – ${prettyTime(booking.endTime)} (IST)`,
    `Service: ${booking.serviceName}`,
    `Price: ₹${booking.price} (pay at the centre)`, '',
    `Name: ${booking.name}`, `Mobile: ${booking.phone}`, `Vehicle: ${booking.vehicle}`,
    ...(booking.note ? [`Note: ${booking.note}`] : []), '',
    'Sanju bhaiya, please confirm this booking. Dhanyavaad!',
  ].join('\n');
}

export function whatsappUrl(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function bookingsCsv(bookings) {
  const rows = [['Reference', 'Date', 'Start (IST)', 'End (IST)', 'Service', 'INR', 'Status', 'Name', 'Phone', 'Vehicle', 'Note']];
  for (const b of bookings) rows.push([b.reference, b.date, b.time, b.endTime, b.serviceName, b.price, b.status, b.name, b.phone, b.vehicle, b.note]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function icsText(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
}
function icsDate(value) { return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

export function bookingsIcs(bookings) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Iconic//Booking Desk//EN', 'CALSCALE:GREGORIAN'];
  for (const b of bookings.filter((b) => b.status !== 'cancelled')) {
    lines.push('BEGIN:VEVENT', `UID:${b.reference}@iconic.local`, `DTSTAMP:${icsDate(b.updatedAt)}`,
      `DTSTART:${icsDate(b.startAt)}`, `DTEND:${icsDate(b.endAt)}`,
      `SUMMARY:${icsText(`${b.serviceName} — ${b.name}`)}`,
      `DESCRIPTION:${icsText(`${b.reference}\n${b.vehicle}\n${b.phone}\nStatus: ${b.status}\nPrice: INR ${b.price}`)}`,
      `STATUS:${b.status === 'awaiting_whatsapp' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 line folding, without splitting UTF-8 code points.
  return lines.map((line) => {
    let folded = '', current = '', bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 73) { folded += current + '\r\n '; current = ''; bytes = 1; }
      current += char; bytes += size;
    }
    return folded + current;
  }).join('\r\n') + '\r\n';
}
