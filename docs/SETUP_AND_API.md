# Gotham Federal Bank — API integration and deployment guide

## 1. Proven existing API contract (unchanged)

| Method | URL path on original Cloudflare Worker | Function |
|---|---|---|
| POST | `/api/v1/banks/P628/sign-in` | Customer email/password login; returns a bank session token |
| GET | `/api/v1/banks/P628/dashboard` | Account balances and transfer activity for authenticated user |
| POST | `/api/v1/banks/P628/transfers` | Same-bank and interbank transfers with `Idempotency-Key` |
| GET | `/api/v1/directory/banks` | Shared bank directory |

The original Worker URL remains in `src/cloudflare-config.js`. Do **not** change the Vite port or introduce a localhost Worker URL to bypass browser origin restrictions. If your original portal worked on port 5173, keep running there. If Worker CORS denies your origin, its administrator must grant access.

## 2. Additional features and routes

The original Worker repository was **not supplied**, so this project does not claim to have deployed new routes into that Worker. Instead it supplies a separate Node.js REST companion service, deployed separately using the same bank Firebase Authentication and Firestore project.

| Method | Companion route (`/api/portal` prefix) | Access |
|---|---|---|
| GET | `/health` | Public service status |
| POST | `/auth/login` | Firebase email/password login; returns verified-role ID token |
| POST | `/auth/register` | New Firebase Auth customer + pending user/KYC documents |
| GET | `/me` | Authenticated account identity |
| GET, POST | `/customer/beneficiaries` | Customer's own beneficiaries |
| DELETE | `/customer/beneficiaries/:id` | Only portal-created beneficiary |
| GET, POST | `/customer/loans` | Customer's own loans |
| PATCH | `/customer/profile` | Only portal-created user profile |
| GET | `/announcements` | Authenticated bank notices |
| GET | `/admin/snapshot` | Protected bank overview; admin only |
| POST | `/admin/kyc/:id/review` | Review only newly portal-created KYC |
| POST | `/admin/loans/:id/review` | Review only newly portal-created loan |
| POST | `/admin/announcements` | Publish bank announcement |

The companion service uses the Firebase Admin SDK internally because it is a trusted server and must enforce secure authorization. Bank apps still communicate with it through **REST**. The existing Worker, Firestore database, collection names and existing documents are preserved.

## 3. Create a bank admin properly

1. Use Firebase Console → Authentication → Users to create/select the real administrator's email/password Firebase account.
2. Copy **only the Firebase Auth UID**, not the password or ID token.
3. Configure that UID under `ADMIN_UIDS` in the companion service's private environment settings. Multiple admins may be comma-separated.
4. Restart the companion API. Only a user whose **verified Firebase ID token** matches an approved UID (or a trusted server-set `admin` custom claim) can access `/admin/*`.
5. Do not put admin UIDs, administrative passwords, or service-account credentials in frontend source or GitHub Actions public variables.

## 4. Run the feature API locally

Install dependencies in `server/`:

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` using your actual project configuration:

```dotenv
FIREBASE_PROJECT_ID=gotham-federal-bank
FIREBASE_WEB_API_KEY=<firebase-web-api-key-for-the-bank-project>
ADMIN_UIDS=<real-existing-admin-auth-uid>
ALLOWED_ORIGINS=http://localhost:5173,https://gug-2005.github.io
PORT=8787
GOOGLE_APPLICATION_CREDENTIALS=C:/secure-credentials/gotham-bank-new-service-account.json
```

The web API key is used by Google Identity Toolkit for Firebase login and is **not an administrative secret**. The service-account file **is secret**. Use Application Default Credentials on Cloud Run when possible. If your previously posted service-account private key has not been revoked, revoke it now.

```bash
npm run dev
```

Use a **separate development Firebase project** for end-to-end write testing before changing a bank production project. Running this service against your bank's live Firestore will create new customer/KYC records when signup is used and may modify those newly created records during approvals. Pre-existing financial records are read-only through the companion API.

## 5. Connect the React UI

In the project root create `.env.local`:

```dotenv
VITE_GOTHAM_PORTAL_API_URL=http://localhost:8787
```

Do not set `VITE_X42_API_URL` for local use unless you need to override the known-good original Worker URL. Restart `npm run dev` after editing `.env.local`.

When publishing on GitHub Pages, deploy the companion API to an **HTTPS host** first, then configure the GitHub Actions variable `VITE_GOTHAM_PORTAL_API_URL` with its public HTTPS origin and redeploy. GitHub Pages serves static React files only; it cannot host the Node companion backend.

## 6. Data model and changes

The service reads pre-existing bank data in `accounts`, `transfers`, `users`, and `kyc_requests`. New records are added in existing collections `users`, `kyc_requests`, `accounts`, `ledger_entries`, `beneficiaries`, `loans` and a new optional `portal_announcements` collection. It uses the `portalCreated: true` flag to permit mutation of only newly created documents. The authorized admin can approve new KYC requests; this creates an active synthetic account and a ledger entry with the ₹1,000 opening deposit in paise. Opening credit should be reconciled with the bank's agreed X42 onboarding contract before using the feature in a shared banking network. Do not use this as a real-money banking system.

## 7. What remains unverified

- No live Firebase/Worker authentication could be tested because no working server credentials or quota were provided for a live test.
- No production migration was performed; no Firestore data was modified by this work.
- Original Worker internals are not in the uploaded frontend archive; session token compatibility and account onboarding conventions must be verified with its maintainer.
- Full transaction tests must be performed after backend quota/access is restored.
- The new Node companion service requires a separate HTTPS deployment and legitimate Firebase configuration.

## 8. Security and operational reminders

- No credentials or seeded demo passwords are bundled.
- Admin role is never determined by a user-supplied `role` or by choosing the admin login tab.
- No client-side Firebase Admin SDK or service-account JSON.
- All companion requests require a valid Firebase Auth ID token (except login/signup/health).
- The original Worker remains the only transfer execution path. Retried transfers reuse the stored idempotency reference.
- The server's basic origin allowlist is **not** an authentication control. Restrict IAM privileges, enforce Firestore Security Rules, audit admin operations and apply API rate limits before production use.
- Never enable public write access to bank Firestore for this project.

## 9. Known issue from earlier UI iterations

If you previously created a `.env.development.local` containing `VITE_X42_API_URL=http://localhost:5174`, **delete that setting**. The old application is designed to call the original Worker origin, and the approved design is served by the original Vite configuration on port 5173. Do not paste Markdown links inside a Vite `proxy.target` or `.env` value. The UI in this archive does not add such a proxy.
