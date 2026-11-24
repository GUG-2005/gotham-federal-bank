# Verification and implementation status

## What was checked locally (2026-11-24)

- Original backend-facing files `LiveBank.jsx`, `live-api.js`, `cloudflare-config.js`, `bank-config.js`, and `vite.config.js` were byte-for-byte identical to the uploaded original Gotham project.
- TypeScript's JSX parser reported no syntax errors for `src/BankApp.jsx` or `src/main.jsx`.
- `node --check server/src/server.js` passed.
- `node --test tests/*.test.mjs` passed 5 of 5 static/unit contract checks.
- Grep checks found no seeded demo email/password credentials or `demo-model.js` in the shipping source.
- No Firestore write, Cloudflare Worker call, Firebase login, live transfer, or deployment was performed by this code-generation task.

## Still requires live verification when quota/access is restored

1. Install dependencies: `npm ci`, `cd server && npm install`.
2. `npm run build` and `cd server && npm test` (only when you add server integration tests).
3. Configure `server/.env` and obtain valid, newly rotated backend credentials.
4. Test Firebase Authentication login for a real existing customer.
5. Test Worker dashboard and transfers for that customer.
6. Create and approve an account in a **separate development** Firebase project; verify account/ledger compatibility with the bank Worker.
7. Test admin UID allowlisting and verify a normal customer cannot access admin routes.
8. Deploy the Node companion API to HTTPS; add the public URL to GitHub Actions variable `VITE_GOTHAM_PORTAL_API_URL`.
9. Verify browser-origin CORS and the hosted frontend URL.

**Important:** This is a completed code package, not a claim that new API endpoints are deployed or tested against Firebase. Backend quota or missing credentials prevent remote verification.
