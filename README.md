# Gotham Federal Bank — API-backed customer and admin portal

The previously approved customer/admin visual design now uses real bank APIs. **No demo accounts, hardcoded login credentials, localStorage financial records, or automatic fake transfers are included.**

## Components

- `src/BankApp.jsx` — new customer/admin user interface (default route `/#/`).
- `src/BankApp.css` — styling from the approved demo design.
- `src/portal-api.js` — optional authenticated bank feature API client.
- `src/LiveBank.jsx` — **original, unchanged** banking UI at `/#/live`.
- `src/live-api.js`, `src/cloudflare-config.js`, `src/bank-config.js`, `vite.config.js` — **original, unchanged**.
- `server/` — **separate optional** Node/Express/Firebase companion service for feature gaps; does not replace or modify the original Cloudflare Worker.

## Start the existing frontend

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/` to see the approved UI. Open `http://localhost:5173/#/live` to inspect the original unchanged portal.

**Customer login** retains the original `/api/v1/banks/P628/sign-in`; dashboard and transfers retain the original Worker endpoints. The original login works only if the Worker is reachable and the bank Firebase account is valid. The new portal service is required for customer signup, profiles, beneficiaries, loans, and the admin portal.

## Start the optional feature API

See [docs/SETUP_AND_API.md](docs/SETUP_AND_API.md). It requires Firebase Authentication and an authorized server identity for the **existing Gotham bank project**, not a new dummy database. Setup must use a fresh service-account credential if an earlier credential was disclosed.

## Verify without Firebase quota

```bash
npm run test:contracts
npm run build
```

These tests verify source contracts; they cannot certify actual Firebase login or transfer operations. Do not present the integration as live-tested without running it against the deployed bank backend.

## Safety

Never commit `.env` or service-account JSON. The frontend contains no privileged keys. Administrator authorization is determined solely on the backend using verified Firebase ID tokens and an approved UID allowlist. Financial transfers are executed only by the existing Worker; the companion API cannot debit or credit existing customer accounts. The companion API may create new portal records and approve new portal registrations, creating an initial *synthetic* opening balance; it does not rewrite pre-existing accounts or transactions.
