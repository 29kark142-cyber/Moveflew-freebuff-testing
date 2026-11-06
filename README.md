# MoveFlew

Moving-company operations platform: marketing site, website quote intake, CRM workspace,
field crew app, platform admin and customer-facing proposal/payment pages — built on
TanStack Start with Supabase and Stripe.

Phases 1–4 add smart tariffs, storage vaults, a four-tier pricing page, AI scan credits with
Stripe billing, an embeddable lead widget, white-label branding, and scheduled customer
notifications (pre-move upsell, move-day tracking, post-move review).

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TanStack Router (file-based routes in `src/routes`), Radix UI primitives, Recharts, lucide icons |
| SSR / server | TanStack Start with Nitro 3 (`src/server.ts` entry); Cloudflare is the default build target |
| Styling | Tailwind CSS v4 through `@tailwindcss/vite` — CSS-first configuration in `src/styles.css`, no `tailwind.config.js` |
| Data | Supabase Postgres, Auth and Storage via `@supabase/supabase-js`; server code uses a service-role client |
| Payments | Stripe Checkout plus HMAC-signed webhooks |
| Offline | `vite-plugin-pwa` service worker with a field-only offline shell |
| Tooling | Vite 8, TypeScript 5.8, Bun, Vitest 4 + Testing Library, ESLint + Prettier |

## Requirements

- Bun 1.4+ (the committed lockfile is `bun.lock`)
- Node.js 20+ for tooling that shells out to Node
- A Supabase project, plus Stripe keys if you want paid scan packs

## Local setup

```sh
git clone <repository-url>
cd <repository-name>
bun install --frozen-lockfile
cp .env.example .env      # then fill in your own values
bun run dev               # Vite dev server (prints the URL; port 3000 in the sandbox)
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required to sign in. Server-only features
degrade safely when their secrets are missing: Stripe checkout and the webhook return `503` with
an actionable log line, and the cron sweep refuses to run rather than marking reminders as
blocked. Nothing crashes because a key is absent.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Vite dev server with HMR |
| `bun run build` | Production build — client assets and the Nitro server bundle under `.output/` |
| `bun run build:dev` | Build in development mode |
| `bun run preview` | Serve the built app locally |
| `bun run test` | Run the Vitest unit suite once |
| `bun run test:watch` | Vitest in watch mode |
| `bun run lint` | ESLint across the repository |
| `bun run format` | Prettier write |

Type checking is a separate step because Vite ships without it:

```sh
npx tsc --noEmit
```

## Environment variables

Copy `.env.example` to `.env` and fill in real values. Anything prefixed with `VITE_` is
compiled into the browser bundle and is therefore public; everything else stays server-side.

### Client (public, `VITE_` prefix)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) key used by the browser client |
| `VITE_PAYMENTS_CLIENT_TOKEN` | Public publishable key for the deposit payment UI |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser key for map previews |

### Server-only

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase URL for server clients |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key for caller-scoped server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — required by webhooks, cron sweeps and proposal enrichment |
| `STRIPE_SECRET_KEY` | Creates AI scan-pack Checkout Sessions |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/webhooks/stripe` (`whsec_…`) |
| `CRON_SECRET` | Bearer token required by `/api/cron/notifications` — use a long random value |
| `PUBLIC_SITE_URL` | Public origin used in tracking links, review messages and Stripe return URLs |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS delivery |
| `SENDGRID_API_KEY`, `MESSAGING_FROM_EMAIL` | Email delivery and the verified sender address |
| `GOOGLE_MAPS_API_KEY` | Server-side maps key |
| `STRIPE_SANDBOX_API_KEY`, `STRIPE_LIVE_API_KEY`, `PAYMENTS_SANDBOX_WEBHOOK_SECRET`, `PAYMENTS_LIVE_WEBHOOK_SECRET`, `LOVABLE_API_KEY` | Optional legacy deposit connector; sandbox and live stay separate |

`.env`, `.env.local`, `.env.development` and every other `.env.*` file are git-ignored — only
`.env.example` with empty placeholders is committed.

## Route map

### Public and marketing

| Route | Description |
| --- | --- |
| `/` | Marketing home with product previews |
| `/pricing` | Four-tier subscription pricing |
| `/contact` | Contact form |
| `/vs-smartmoving`, `/smartmoving-alternative` | Comparison pages |
| `/privacy`, `/terms` | Owner-authored policy pages |
| `/demo/proposal` | Proposal demo |
| `/embed/lead` | Embeddable lead-capture widget |

### Authentication and onboarding

| Route | Description |
| --- | --- |
| `/login`, `/register` | Sign in and workspace registration |
| `/invite/$token` | Crew invitation acceptance |
| `/join-crew` | Crew onboarding entry point |

### Workspace

| Route | Description |
| --- | --- |
| `/app/*` | CRM workspace — dashboard, estimates, jobs, customers, dispatch, invoices, reports, tariffs, settings |
| `/app/storage` | Storage vaults |
| `/app/field` | Field crew app (offline-capable) |
| `/admin/platform` | Platform super-admin tools |
| `/platform` | Platform landing |

### Customer-facing token routes

| Route | Description |
| --- | --- |
| `/proposal/$token` | Published proposal with signature support |
| `/move/$jobId` | Customer move-day tracking |
| `/payment-complete` | Deposit checkout return page |

### API

| Route | Description |
| --- | --- |
| `/api/crm/*` | Caller-scoped CRM API (jobs, customers, estimates, AI credits, checkout) |
| `/api/copilot` | Streaming CrewAI copilot, bearer-verified server-side |
| `/api/webhooks/stripe` | Verified Stripe events for AI scan packs |
| `/api/cron/notifications` | Scheduled notification sweep, `CRON_SECRET` bearer |
| `/api/public/v1/quotes` | External website quote intake (hashed workspace credentials) |
| `/api/public/v1/leads` | Third-party lead intake |
| `/api/public/v1/hooks/$token` | Signed third-party webhook receiver |
| `/api/public/v1/track/$token` | Public move tracking |
| `/api/public/payments/webhook` | Legacy deposit payment webhook |
| `/api/v1/public/quotes` | Compatibility alias for the quote endpoint |

## Project structure

```
src/routes/     TanStack Router file routes — pages and API handlers
src/pages/      Migrated screens and workspace views
src/components/ UI, including the workspace shell and CRM widgets
src/server/     Server-only logic: CRM API, field API, billing, notifications
src/shared/     Framework-free domain rules and their unit tests
src/lib/        Auth, Stripe, PWA and release helpers
supabase/       SQL migrations, policies and RPCs
public/         Static assets, manifest and the field offline shell
```

## Data and security notes

- Feature data for phases 1–4 (AI credits, branding, notification state) lives in
  `workspace_records.data` JSONB, so these features need no new migrations.
- Subscription plans live in `subscription_plans` with defaults in `src/shared/plans.ts`;
  workspace billing fields change only through the service role.
- Row-level security scopes records per workspace, and the CRM API returns `402` for
  read-only (past-due or cancelled) workspaces.
- The service-role key is used only in server code. Webhook and cron routes authenticate by
  signature or bearer token, never by a browser session.
- Field drafts and pending operations live in user- and workspace-scoped IndexedDB, are
  replayed in order, and are never read from legacy unscoped keys.

## Billing and notifications

- `POST /api/crm/ai-credits/checkout` creates a Stripe Checkout Session for the $5 single
  scan or the $25 six-pack and returns its URL.
- `POST /api/webhooks/stripe` verifies the signature (5-minute tolerance), credits only paid
  sessions, and is idempotent per Stripe event and session id, writing `ai_credit_purchase`
  records.
- `GET|POST /api/cron/notifications` sweeps due reminders for every workspace. Schedule it
  with `Authorization: Bearer $CRON_SECRET`; point Stripe at
  `https://<your-domain>/api/webhooks/stripe` with the matching signing secret.

## Deployment

`bun run build` targets Nitro's Cloudflare Pages preset and writes the deployable bundle to
`dist` (`_worker.js`, `_routes.json`, `_headers`, `_redirects`, and static assets). For a
Cloudflare Pages project, use `bun run build` as the build command and `dist` as the output
directory. On Pages, `_routes.json` sends application routes to `_worker.js`, which handles SSR
and `/api/*`. `public/_redirects` contains the requested `/* /index.html 200` rule for static
hosts. Set the environment variables in the host and keep `.env` out of version control.

## PWA and offline field work

`public/field-offline.html` is the offline shell. The generated `/sw.js` precaches the shell,
assets and styles, serves `/app/field` navigations network-first with the shell as fallback,
and never caches authenticated API responses.
