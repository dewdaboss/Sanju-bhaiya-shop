import { BookingStore } from './store.mjs';
import { PostgresStore } from './postgres-store.mjs';

export async function createLocalStore(env = process.env) {
  if (env.DATABASE_URL?.trim()) {
    const store = new PostgresStore(env.DATABASE_URL.trim());
    await store.init();
    return store;
  }
  if (env.VERCEL) throw new Error('DATABASE_URL is required on Vercel. Local SQLite is not a deployment database.');
  return new BookingStore(env.DATA_DIR || './data');
}
