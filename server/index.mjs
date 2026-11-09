import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.mjs';
import { createLocalStore } from './local-store.mjs';
import { CATALOG } from './domain.mjs';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const number = process.env.SHOP_WHATSAPP || CATALOG.business.whatsapp;
if (!/^[1-9]\d{9,14}$/.test(number)) throw new Error('SHOP_WHATSAPP must be an international number without + or spaces.');
const store = await createLocalStore();
await store.seedDemo();
const initialSettings = await store.getSettings();
const app = createApp({ store, adminPassword: process.env.ADMIN_PASSWORD || '', whatsappNumber: number });

if (production) {
  const dist = resolve('dist');
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('Production build missing. Run npm run build first.');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.use((req, res) => {
    if (req.method !== 'GET') return res.sendStatus(404);
    res.set('Cache-Control', 'no-cache').sendFile(resolve(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, allowedHosts: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Iconic Car Washing Centre — http://0.0.0.0:${port}`);
  console.log(`Storage: ${process.env.DATABASE_URL ? 'Postgres' : 'local SQLite (not for Vercel)'}`);
  console.log(`Bookings: ${initialSettings?.live ? 'LIVE' : 'DEMO ONLY — configure real hours and durations in /admin'}`);
  console.log(`Owner login: ${(process.env.ADMIN_PASSWORD || '').length >= 12 ? 'configured' : 'disabled until ADMIN_PASSWORD is set (12+ characters)'}`);
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
const shutdown = () => server.close(async () => { await store.close(); process.exit(0); });
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
