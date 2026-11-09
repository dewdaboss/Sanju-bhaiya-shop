import { createApp } from './app.mjs';
import { PostgresStore } from './postgres-store.mjs';
import { CATALOG } from './domain.mjs';

let appPromise = null;

async function getApp() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required on Vercel.');
  const whatsappNumber = process.env.SHOP_WHATSAPP || CATALOG.business.whatsapp;
  if (!/^[1-9]\d{9,14}$/.test(whatsappNumber)) throw new Error('SHOP_WHATSAPP must be an international number without + or spaces.');
  if (!appPromise) {
    appPromise = (async () => {
      const store = new PostgresStore(connectionString);
      await store.init();
      await store.seedDemo();
      return createApp({ store, adminPassword: process.env.ADMIN_PASSWORD || '', whatsappNumber });
    })();
    appPromise.catch(() => { appPromise = null; });
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error('Booking API unavailable:', error.message);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'Booking service is not configured yet. Please contact the centre.' }));
    }
  }
}
