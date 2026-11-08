# Iconic Car Washing Centre

Sanju bhaiya ke liye car-care booking website. React + Vite frontend, Express API, persistent SQLite booking store, owner dashboard, and WhatsApp click-to-send booking requests.

**Current mode: demo only.** Poster rates and WhatsApp number are confirmed; actual shop hours and service durations are still needed. No real bookings open until the owner configures and enables them.

```sh
npm ci
npm run dev       # http://localhost:3000
npm test
npm run build
npm start         # production, after configuring .env
```

- Website: `/`
- Owner desk: `/admin`
- Setup / live launch / WhatsApp limitations: [`SETUP.md`](SETUP.md)
- Google Business Profile checklist: [`docs/GOOGLE-BUSINESS.md`](docs/GOOGLE-BUSINESS.md)

Confirmed menu: Car wash ₹150 · Vacuum ₹50 · Dashboard + tyre polish ₹100 · Body polish ₹50 · Complete care ₹350 · VIP wash + polish ₹600.

Bookings use IST. WhatsApp messages are prepared for **7970000601**, but the customer must tap Send and the owner must confirm. This is not an automatic WhatsApp Business API integration.
