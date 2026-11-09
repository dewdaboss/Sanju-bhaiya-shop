# Iconic Car Washing Centre — setup & handover

## Ab kya storage use hoti hai?

- **Vercel / public production:** Postgres (`DATABASE_URL`). Bookings, owner sessions aur rate limits database mein save hote hain.
- **Local preview without DATABASE_URL:** SQLite fallback, sirf local demo/development ke liye. Vercel par SQLite fallback use nahi hota.
- Overlapping slot protection transaction + Postgres advisory lock se hoti hai, taaki alag serverless instances ek hi slot double-book na karein.

**Abhi bhi live bookings band hain.** Rates aur WhatsApp number confirmed hain; actual opening/closing time aur service durations abhi chahiye. 09:00–19:00 schedule aur durations **sirf demo examples** hain.

## Vercel par live karna (recommended path)

Short checklist: [`docs/VERCEL-DEPLOY.md`](docs/VERCEL-DEPLOY.md).

1. Ek Postgres database banao — Neon/Supabase/jaisa provider. **Pooled connection string** copy karo. Connection string ko chat, Git ya frontend mein share mat karo.
2. Vercel mein GitHub repo import karo. `vercel.json` already set hai:
   - Framework: Vite
   - Install: `npm ci`
   - Build: `npm run build`
   - Output: `dist`
   - API: `api/[...path].mjs`
   - `/admin` rewrite: `index.html`
3. Vercel **Environment Variables** mein set karo:
   - `DATABASE_URL` = pooled Postgres connection string
   - `ADMIN_PASSWORD` = unique password, **12+ characters**
   - `SHOP_WHATSAPP` = `917970000601`
4. Project Settings mein Node.js **22.x** select karo.
5. Deploy karo. Deploy ke baad `/admin` kholo, login karo, **Shop settings** mein actual hours/durations/weekly off/capacity bharein.
6. **Accept live bookings** check karke save karo. Ek test booking banao, WhatsApp message ka number/date/time check karo, **Send** dabao, phir test request dashboard se cancel karo.

Production ke liye `DATABASE_URL` aur `ADMIN_PASSWORD` zaroori hain. Preview deployments ke liye alag test database better hai; same production database preview par use karne se settings/data mix ho sakte hain.

## Local chalana

Node.js **22.13+** chahiye (Node 22.22 par tested).

```sh
npm ci
cp .env.example .env   # values fill karein; DATABASE_URL local mein optional hai
npm run dev
```

Server `0.0.0.0:3000` par chalta hai. `DATABASE_URL` set ho to local server bhi Postgres use karega; warna local SQLite demo store. Browser API calls relative URLs use karti hain.

## Owner password aur live schedule

1. `/admin` kholen aur sign in karein.
2. **Shop settings** mein actual opening/closing time, weekly offs, slot interval, capacity aur har service ke minutes bharein.
3. **Accept live bookings** check karein, phir **Save shop settings** dabayein.
4. Website par test booking banayein. WhatsApp mein message khulna aur **Send** dabana zaroor check karein. Test request cancel karein taaki slot free ho jaye.

Live mode on hote hi public demo API/dashboard band ho jata hai. Existing real bookings apne original time/price snapshots rakhti hain. Pause karne ke liye live checkbox off karke save karein; existing records delete nahi hote.

Sessions database mein save hote hain, 8 hours mein expire hote hain, aur logout par revoke hote hain. Password rotate karne par purane sessions invalidate karne ke liye `admin_sessions` table clear karein.

## WhatsApp ka actual flow

Aapne **simple WhatsApp Send** option choose kiya hai:

1. Customer service, date, slot aur details choose karta hai.
2. Website server par request save karti hai aur **15 minutes ka temporary hold** deti hai.
3. Customer **Open WhatsApp & send** dabata hai. WhatsApp app/web mein shop number aur ready message khulta hai.
4. Customer **Send** dabata hai. Message mein date, time, service, price, name, mobile, vehicle aur reference hota hai.
5. Sanju bhaiya message check karke dashboard mein **Confirm** karte hain; chahein to customer ko WhatsApp par confirmation reply bhejte hain.
6. Unconfirmed requests 15 minutes baad expire hoti hain. Send karne se booking automatically confirmed nahi hoti.

**Important:** Yeh automatic WhatsApp notification/API nahi hai. Website chupke se message send nahi kar sakti. Customer ka Send aur owner ka confirmation zaroori hai. Day-list button bhi WhatsApp mein ready text kholta hai; send aapko karna hai. Automatic server-to-WhatsApp messages chahiye hon to approved WhatsApp Business Platform setup, templates aur secure server-side credentials ki alag setup zaroorat hogi. Tokens kabhi frontend mein na rakhein.

## Google Business Profile

Aapne **Google Business Profile** choose kiya tha, Maps widget nahi. Exact shop address abhi nahi mila, isliye fake address/map pin nahi lagaya gaya.

Detailed checklist: [`docs/GOOGLE-BUSINESS.md`](docs/GOOGLE-BUSINESS.md). Vercel live URL milne ke baad use website/booking link ke roop mein add karein. Listing aapke Google account mein banegi aur verification aapko complete karni hogi.

## Tests

```sh
npm test          # domain + HTTP/API + embedded Postgres tests
npm run build     # TypeScript + production bundle
npm run test:ui   # browser smoke/live flow; build first, port 3100 temporarily used
```

Postgres tests embedded Postgres (PGlite) par chalte hain; production mein actual Postgres provider use hota hai. Browser tests Chromium ka npm-packaged binary use karte hain.

## Privacy / operational notes

- Real customer details only owner APIs se accessible hain. Demo list public hai, lekin usmein personal details store nahi hoti.
- Owner cancelled record ka **Delete details** use karke personal data hata sakte hain. Active booking pehle cancel karni hogi; cancellation slot free karti hai, isliye customer ko inform karein.
- CSV/Calendar exports mein customer details hoti hain; files responsibly share karein.
- Database backups provider dashboard se enable/rakhein. Restore test karein.
- No online payments, no fake reviews, no invented address, no unconfirmed bike/engine/foam/interior prices.
- Original notice ki breakage/damage disclaimer website par visible hai. Vehicle condition service se pehle discuss karein.
