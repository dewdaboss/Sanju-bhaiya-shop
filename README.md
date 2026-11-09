# Iconic Car Washing Centre

Sanju bhaiya ke liye car-care booking website. React + Vite frontend, Vercel-compatible Node API, **Postgres production storage**, local SQLite demo fallback, owner dashboard, and WhatsApp click-to-send booking requests.

**Current mode: demo only.** Poster rates and WhatsApp number are confirmed; actual shop hours and service durations are still needed. No real bookings open until the owner configures and enables them.

```sh
npm ci
npm run dev       # http://localhost:3000 (SQLite demo if DATABASE_URL is empty)
npm test          # includes embedded Postgres tests
npm run build
npm run test:ui
```

- Website: `/`
- Owner desk: `/admin`
- Vercel deploy checklist: [`docs/VERCEL-DEPLOY.md`](docs/VERCEL-DEPLOY.md)
- Full setup / WhatsApp limitations: [`SETUP.md`](SETUP.md)
- Google Business Profile checklist: [`docs/GOOGLE-BUSINESS.md`](docs/GOOGLE-BUSINESS.md)

Vercel environment variables: `DATABASE_URL`, `ADMIN_PASSWORD`, `SHOP_WHATSAPP`. See `vercel.json` and `.env.example`.

Confirmed menu: Car wash ₹150 · Vacuum ₹50 · Dashboard + tyre polish ₹100 · Body polish ₹50 · Complete care ₹350 · VIP wash + polish ₹600.

Bookings use IST. WhatsApp messages are prepared for **7970000601**, but the customer must tap Send and the owner must confirm. This is not an automatic WhatsApp Business API integration.
