import express from 'express';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { CATALOG, SERVICES, DEMO_SETTINGS, HttpError, shopDate, parseSettings, validateBooking, bookingMessage, whatsappUrl, bookingsCsv, bookingsIcs, prettyDate, prettyTime } from './domain.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function limiter(max, windowMs, now) {
  const hits = new Map();
  return (req, res, next) => {
    const time = now().getTime();
    for (const [key, value] of hits) if (value.reset <= time) hits.delete(key);
    const key = req.ip || 'unknown';
    const hit = hits.get(key) || { count: 0, reset: time + windowMs };
    hit.count++;
    hits.set(key, hit);
    if (hit.count > max) {
      res.set('Retry-After', String(Math.ceil((hit.reset - time) / 1000)));
      return next(new HttpError(429, 'Too many requests. Please wait a little and try again.'));
    }
    next();
  };
}

export function createApp({ store, adminPassword = '', whatsappNumber = CATALOG.business.whatsapp, now = () => new Date() }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('sec-fetch-site') === 'cross-site') return next(new HttpError(403, 'Cross-site requests are not allowed.'));
      const origin = req.get('origin');
      if (origin) {
        try {
          const allowedHosts = [req.get('host'), ...(req.get('x-forwarded-host') || '').split(',').map((s) => s.trim())];
          if (!allowedHosts.includes(new URL(origin).host)) return next(new HttpError(403, 'Request origin does not match this website.'));
        } catch { return next(new HttpError(403, 'Invalid request origin.')); }
      }
    }
    next();
  });

  const adminEnabled = adminPassword.length >= 12 && adminPassword.length <= 256;
  const salt = randomBytes(16);
  const passwordHash = adminEnabled ? scryptSync(adminPassword, salt, 64) : null;
  const sessions = new Map();
  const cookieName = 'iconic_admin';
  const tokenFrom = (req) => {
    const part = (req.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`));
    return part ? part.slice(cookieName.length + 1) : '';
  };
  const isAuthenticated = (req) => {
    const token = tokenFrom(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    const expiry = sessions.get(digest(token));
    if (!expiry || expiry <= now().getTime()) { sessions.delete(digest(token)); return false; }
    return true;
  };
  const requireAdmin = (req, res, next) => {
    if (!adminEnabled) return next(new HttpError(503, 'Owner access is not configured. Set ADMIN_PASSWORD on the server.'));
    if (!isAuthenticated(req)) return next(new HttpError(401, 'Please sign in to the owner dashboard.'));
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-requested-with') !== 'XMLHttpRequest') return next(new HttpError(403, 'Missing request verification header.'));
    next();
  };
  const activeContext = () => {
    const configured = store.getSettings();
    const live = Boolean(configured?.live);
    return { live, settings: live ? configured : DEMO_SETTINGS, demoAvailable: !live };
  };
  const requireDemo = (req, res, next) => {
    if (!activeContext().demoAvailable) return next(new HttpError(404, 'Demo is closed while real bookings are live.'));
    next();
  };
  const dayStats = (bookings) => ({
    total: bookings.filter((b) => b.status !== 'cancelled').length,
    pending: bookings.filter((b) => b.status === 'awaiting_whatsapp').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    expectedRevenue: bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).reduce((sum, b) => sum + b.price, 0),
  });
  const dateQuery = (req) => typeof req.query.date === 'string' ? req.query.date : shopDate(now());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/meta', (req, res) => {
    const context = activeContext();
    res.json({
      business: { ...CATALOG.business, whatsapp: whatsappNumber },
      services: SERVICES.map((s) => ({ ...s, minutes: context.settings.durations[s.id] })),
      askAtCentre: CATALOG.askAtCentre, settings: context.settings,
      live: context.live, demoAvailable: context.demoAvailable, adminEnabled,
      holdMinutes: 15, windowDays: 60,
    });
  });

  app.get('/api/availability', limiter(120, 60_000, now), (req, res, next) => {
    const context = activeContext();
    if (!context.live) return next(new HttpError(503, 'Real timings are not configured. Use the explicitly labelled demo.'));
    res.json(store.availability(context.settings, req.query.date, req.query.serviceId, 'real', now()));
  });
  app.post('/api/bookings', limiter(12, 3600_000, now), (req, res, next) => {
    const context = activeContext();
    if (!context.live) return next(new HttpError(503, 'Real bookings are not open yet. Please call or WhatsApp the centre.'));
    const input = validateBooking(req.body, now());
    const result = store.createBooking(input, context.settings, 'real', now());
    res.status(result.replay ? 200 : 201).json({ ...result, demo: false, whatsappUrl: whatsappUrl(whatsappNumber, bookingMessage(result.booking)) });
  });

  app.get('/api/demo/availability', requireDemo, limiter(120, 60_000, now), (req, res) => {
    res.json(store.availability(DEMO_SETTINGS, req.query.date, req.query.serviceId, 'demo', now()));
  });
  app.post('/api/demo/bookings', requireDemo, limiter(30, 3600_000, now), (req, res) => {
    const input = validateBooking(req.body, now(), { demo: true });
    const safeInput = { ...input, name: 'Demo guest', phone: '', vehicle: 'Demo vehicle', note: 'Preview only — personal details discarded.' };
    const result = store.createBooking(safeInput, DEMO_SETTINGS, 'demo', now());
    res.status(result.replay ? 200 : 201).json({ ...result, demo: true, whatsappUrl: null });
  });
  app.get('/api/demo/bookings', requireDemo, (req, res) => {
    const bookings = store.listBookings(dateQuery(req), 'demo', now());
    res.json({ date: dateQuery(req), bookings, stats: dayStats(bookings), demo: true });
  });
  app.patch('/api/demo/bookings/:id', requireDemo, (req, res) => {
    res.json({ booking: store.updateStatus(Number(req.params.id), req.body?.status, 'demo', now()) });
  });

  app.get('/api/admin/session', (req, res) => res.json({ authenticated: adminEnabled && isAuthenticated(req), adminEnabled }));
  app.post('/api/admin/login', limiter(6, 15 * 60_000, now), (req, res, next) => {
    if (!adminEnabled) return next(new HttpError(503, 'Set a unique ADMIN_PASSWORD of at least 12 characters on the server first.'));
    const supplied = typeof req.body?.password === 'string' ? req.body.password.slice(0, 256) : '';
    const matches = timingSafeEqual(scryptSync(supplied, salt, 64), passwordHash);
    if (!matches) return next(new HttpError(401, 'That password is not correct. Please try again.'));
    for (const [key, expiry] of sessions) if (expiry <= now().getTime()) sessions.delete(key);
    const token = randomBytes(32).toString('hex');
    sessions.set(digest(token), now().getTime() + 8 * 3600_000);
    res.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 8 * 3600_000, path: '/' });
    res.json({ authenticated: true });
  });
  app.post('/api/admin/logout', (req, res) => {
    sessions.delete(digest(tokenFrom(req)));
    res.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });
  app.get('/api/admin/settings', requireAdmin, (req, res) => res.json({ settings: store.getSettings() }));
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const settings = parseSettings(req.body);
    store.saveSettings(settings);
    res.json({ settings, live: settings.live });
  });
  app.get('/api/admin/bookings', requireAdmin, (req, res) => {
    const bookings = store.listBookings(dateQuery(req), 'real', now());
    res.json({ date: dateQuery(req), bookings, stats: dayStats(bookings), demo: false });
  });
  app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
    res.json({ booking: store.updateStatus(Number(req.params.id), req.body?.status, 'real', now()) });
  });
  app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
    store.deleteBooking(Number(req.params.id), 'real');
    res.json({ ok: true });
  });
  app.get('/api/admin/export', requireAdmin, (req, res) => {
    const date = dateQuery(req);
    const bookings = store.listBookings(date, 'real', now());
    if (req.query.format === 'ics') {
      res.type('text/calendar; charset=utf-8').set('Content-Disposition', `attachment; filename="iconic-${date}.ics"`).send(bookingsIcs(bookings));
    } else {
      res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="iconic-${date}.csv"`).send(bookingsCsv(bookings));
    }
  });
  app.get('/api/admin/whatsapp-list', requireAdmin, (req, res) => {
    const date = dateQuery(req);
    const bookings = store.listBookings(date, 'real', now()).filter((b) => b.status !== 'cancelled');
    const lines = [`ICONIC — BOOKING LIST`, prettyDate(date), 'All times IST. Please check pending requests.', ''];
    for (const b of bookings.slice(0, 20)) lines.push(`${prettyTime(b.time)} | ${b.serviceName} | ₹${b.price}\n${b.name} · ${b.phone}\n${b.reference} · ${b.status.replaceAll('_', ' ')}\n`);
    if (bookings.length > 20) lines.push('First 20 bookings only. Download the CSV for the complete list.');
    if (!bookings.length) lines.push('No active bookings for this date.');
    res.json({ url: whatsappUrl(whatsappNumber, lines.join('\n')), count: bookings.length });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'This API endpoint does not exist.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    if (status === 500) console.error('Request failed:', error.message);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on our side. Please try again.' : status === 413 ? 'The request is too large.' : status === 400 && !(error instanceof HttpError) ? 'Invalid JSON request.' : error.message, ...(error.fields ? { fields: error.fields } : {}) });
  });
  return app;
}
