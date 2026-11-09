import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../server/vercel-handler.mjs';
import { createLocalStore } from '../server/local-store.mjs';

test('Vercel handler fails closed without DATABASE_URL and does not leak details', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const headers = {};
  let body = '';
  const res = { headersSent: false, statusCode: 0, setHeader: (key, value) => { headers[key] = value; }, end: (value) => { body = value; } };
  try {
    await handler({ method: 'GET', url: '/api/meta' }, res);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  }
  assert.equal(res.statusCode, 503);
  assert.match(headers['Content-Type'], /application\/json/);
  const data = JSON.parse(body);
  assert.match(data.error, /not configured/);
  assert.ok(!body.includes('postgresql://'));
});

test('local store refuses SQLite fallback on Vercel', async () => {
  await assert.rejects(() => createLocalStore({ VERCEL: '1' }), /DATABASE_URL is required/);
});

test('Vercel config targets the Vite build and admin SPA route', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, 'vite');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.buildCommand, 'npm run build');
  assert.ok(config.rewrites.some((r) => r.source === '/admin' && r.destination === '/index.html'));
});
