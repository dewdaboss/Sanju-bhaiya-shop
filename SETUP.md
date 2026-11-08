# Iconic Car Washing Centre — setup & handover

## Abhi kya bana hai

- Mobile-friendly website, Iconic yellow/charcoal branding, original shop photos and an explicitly labelled illustrative hero image.
- Six bookable services using the rates you confirmed from the poster.
- Date/time slots in **Asia/Kolkata (IST)**, 60-day booking window, configurable working hours, weekly offs, service durations and simultaneous-vehicle capacity.
- SQLite-backed reservations shared by all visitors to the same server. Overlapping bookings are checked inside a database transaction; retries are idempotent.
- Owner dashboard at `/admin`: date-wise list, confirm/complete/cancel, CSV and `.ics` calendar export, WhatsApp day-list sharing, shop settings.
- Booking requests include reference, service, price, date, start/end time, name, mobile and vehicle in a ready-made WhatsApp message to **7970000601**.

**Abhi live bookings band hain.** Aapne rates aur number confirm kiya, lekin actual opening/closing time aur durations nahi diye. Website ka 09:00–19:00 schedule aur service durations **sirf demo examples** hain. Public demo bookings cannot reserve real slots or send messages to the shop. Personal fields in demo requests are discarded by the server.

## 1. Local / preview chalana

Node.js **22.13+** chahiye (Node 22.22 par tested; built-in SQLite experimental warning normal hai).

```sh
npm ci
npm run dev
```

Server `0.0.0.0:3000` par chalta hai. Vite frontend usi server se serve hota hai; browser API calls relative URLs use karti hain. Reverse-proxy preview hosts allowed hain. Port badalna ho to `.env` mein `PORT` set karein.

## 2. Owner password aur live schedule

1. `.env.example` ko `.env` mein copy karein.
2. `ADMIN_PASSWORD` mein apna unique password rakhein, **kam se kam 12 characters**. Koi default password nahi hai. Password chat, Git ya frontend code mein na daalein.
3. Server restart karein, `/admin` kholen aur sign in karein.
4. **Shop settings** mein actual opening/closing time, weekly offs, slot interval, capacity aur har service ke minutes bharein.
5. **Accept live bookings** check karein, phir **Save shop settings** dabayein.
6. Website par ek test booking banayein. WhatsApp mein message khulna aur **Send** dabana zaroor check karein. Test request ko dashboard se cancel karein taaki slot free ho jaye.

Live mode on hote hi demo API/dashboard band ho jata hai. Existing real bookings apne original time/price snapshots rakhti hain. Pause karne ke liye live checkbox off karke save karein; existing records delete nahi hote.

`.env` settings:

```dotenv
PORT=3000
ADMIN_PASSWORD=replace-with-your-own-private-password
DATA_DIR=./data
SHOP_WHATSAPP=917970000601
```

`SHOP_WHATSAPP` international format mein hai, bina `+`, spaces ya dashes. Isi number par booking messages aur day lists khulti hain. Owner login ke liye strong unique password use karein; sessions 8 hours mein expire hote hain aur server restart par logout ho jata hai.

## 3. WhatsApp ka actual flow

Aapne **simple WhatsApp Send** option choose kiya hai:

1. Customer service, date, slot aur details choose karta hai.
2. Website server par request save karti hai aur **15 minutes ka temporary hold** deti hai.
3. Customer **Open WhatsApp & send** dabata hai. WhatsApp app/web mein shop number aur ready message khulta hai.
4. Customer **Send** dabata hai. Message mein date, time, service, price, name, mobile, vehicle aur reference hota hai.
5. Sanju bhaiya message check karke dashboard mein **Confirm** karte hain; chahein to customer ko WhatsApp par confirmation reply bhejte hain.
6. Unconfirmed requests 15 minutes baad expire hoti hain. Send karne se booking automatically confirmed nahi hoti.

**Important:** Yeh automatic WhatsApp notification/API nahi hai. Website chupke se message send nahi kar sakti. Customer ka Send aur owner ka confirmation zaroori hai. Day-list button bhi WhatsApp mein ready text kholta hai; send aapko karna hai. Automatic server-to-WhatsApp messages chahiye hon to approved WhatsApp Business Platform setup, templates aur secure server-side credentials ki alag setup zaroorat hogi. Tokens kabhi frontend mein na rakhein.

## 4. Hosting / public launch

- `npm run build`, phir `npm start` (production mode). Pehle `.env` configure karein.
- HTTPS wala **single always-on Node host** use karein jo Node 22+, long-running processes aur persistent disk support karta ho. Static-only hosting par backend/SQLite nahi chalega.
- `DATA_DIR` ko persistent disk par point karein. Ephemeral/serverless filesystem par bookings restart/deploy mein kho sakti hain.
- One server instance is enough for a neighbourhood centre. Multiple instances ke liye shared transactional database (e.g. Postgres) mein migration karein; separate SQLite files se double booking ho sakti hai.
- Reverse proxy ko HTTPS forward karna chahiye; app first proxy hop trust karti hai. Direct public exposure mein proxy config apne host ke hisaab se restrict karein.
- Database ka regular backup rakhein. `data/` Git mein commit nahi hota. Backup lete waqt SQLite-consistent backup method use karein, sirf live main DB file copy karna avoid karein.
- Public launch se pehle real schedule, test booking, cancellation, owner login, WhatsApp Send, mobile layout aur backup/restore check karein.

## 5. Google Business Profile

Aapne **Google Business Profile** choose kiya, Maps widget nahi. Exact shop address abhi nahi mila, isliye fake address/map pin nahi lagaya gaya.

Detailed checklist: [`docs/GOOGLE-BUSINESS.md`](docs/GOOGLE-BUSINESS.md). Listing aapke Google account mein banegi aur Google ki verification aapko complete karni hogi; yeh app listing automatically create/verify nahi karti.

## 6. Tests

```sh
npm test          # domain + HTTP/API tests
npm run build     # TypeScript + production bundle
npm run test:ui   # browser smoke/live flow; build first, port 3100 temporarily used
```

Browser tests Chromium ka npm-packaged binary use karte hain. Linux par required system libraries hone chahiye; sandbox mein bundled compatible libraries use ki gayi hain.

## 7. Privacy / operational notes

- Real customer details only owner APIs se accessible hain. Demo list public hai, lekin usmein personal details store nahi hoti.
- Owner cancelled record ka **Delete details** use karke personal data hata sakte hain. Active booking pehle cancel karni hogi; cancellation slot free karti hai, isliye customer ko inform karein.
- CSV/Calendar exports mein customer details hoti hain; files responsibly share karein.
- No online payments, no fake reviews, no invented address, no unconfirmed bike/engine/foam/interior prices.
- Original notice ki breakage/damage disclaimer website par visible hai. Vehicle condition service se pehle discuss karein.
