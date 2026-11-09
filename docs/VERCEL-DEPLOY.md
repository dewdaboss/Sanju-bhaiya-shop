# Vercel par live karne ki checklist

## 1. Code GitHub par ho

Is branch ka code GitHub repo mein hona chahiye jise Vercel import karega. Agar team `main` se deploy karti hai, pehle is branch ko review/merge karein. Vercel mein specific branch bhi select ki ja sakti hai.

## 2. Postgres database banao

Neon/Supabase/jaise Postgres provider mein database banao. **Pooled connection string** lo, SSL enabled rakho. Example format:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Actual password/connection string ko:
- Git mein commit mat karo
- chat mein paste mat karo
- frontend code ya browser URL mein mat daalo

## 3. Vercel project

1. Vercel dashboard → **Add New → Project**.
2. GitHub repo **Sanju-bhaiya-shop** import karo.
3. Branch select karo jisme yeh Vercel-ready code hai.
4. Settings auto-read honi chahiye (`vercel.json`):
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm ci`
5. Node.js version **22.x** set karo.

## 4. Environment Variables

Vercel → Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Postgres pooled connection string |
| `ADMIN_PASSWORD` | Apna unique owner password, 12+ characters |
| `SHOP_WHATSAPP` | `917970000601` |

Production ke liye ye values zaroor set karein. Preview deployments ke liye alag test database use karna safer hai.

## 5. Deploy aur pehla setup

1. **Deploy** dabao.
2. Live URL kholo. Website demo mode mein khulegi jab tak owner live settings save na kare.
3. `https://YOUR-URL/admin` kholo.
4. Owner password se login karo.
5. **Shop settings** mein actual:
   - opening/closing time
   - weekly off
   - slot interval
   - ek saath kitni vehicles
   - har service ke minutes
6. **Accept live bookings** check karke **Save shop settings** dabao.

## 6. Final test

- Website par ek test booking banao.
- WhatsApp button se message kholo.
- Number `7970000601`, date, time, service aur price check karo.
- **Send** dabao.
- Owner dashboard mein request confirm karo.
- Test booking cancel/delete karo taaki real slot free rahe.
- Mobile par layout check karo.

## 7. Baad mein

- Custom domain connect karna ho to Vercel Domains mein add karo.
- Google Business Profile mein hosted website URL aur `/#book` booking link add karo.
- Database backups on rakhein.
- WhatsApp automatic notifications abhi nahi hain; customer Send + owner confirmation flow hai.
