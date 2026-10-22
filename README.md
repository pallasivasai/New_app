# Local Basket — Grocery PWA MVP

A mobile-first local grocery storefront built with React + Vite. Includes a product catalogue, category filters, cart, demo checkout, order summary, PWA manifest/service worker, and a simple local-only owner settings screen.

## Run locally
1. Install Node.js 20+.
2. Run `npm install`
3. Run `npm run dev`
4. Open the URL printed by Vite.

## Build
`npm run build`

## Deploy free
1. Push this project to a new GitHub repository.
2. In Vercel, import that repository.
3. Framework preset: Vite; Build command: `npm run build`; Output directory: `dist`.
4. Deploy and open the provided HTTPS URL.
5. Test `/manifest.webmanifest` and `/sw.js` on the deployed domain.

## Share by link / QR
- Share the HTTPS URL directly.
- Generate a QR code pointing to that exact deployed URL (for example using a QR generator). Recreate it if the URL changes.
- On Android Chrome: menu → Install app / Add to Home screen.
- On iPhone Safari: Share → Add to Home Screen.

## Important limitations
This is a front-end prototype. Cart/order data and owner settings are local to the browser. Orders are **not** sent to a central database or store. No real payments, inventory sync, authentication, SMS, or live courier GPS is implemented. Do not use this as a live commerce system until a backend (e.g. Supabase), access controls, order processing, privacy protections, and operational delivery workflow are added.