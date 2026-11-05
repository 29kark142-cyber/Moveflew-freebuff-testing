# Northwest Moving Crew migration

## Pricing hidden during beta testing
- [x] Remove every dollar figure from public marketing (Pricing page cards and comparison table, shared capability matrix, ROI card, page titles and descriptions); copy now reads "free during beta" with paid plans announced before beta closes.
- [x] Verified no money strings on /pricing and /smartmoving-alternative at 1280px and 390px, no overflow, no console errors, cards balanced; 93 tests pass, typecheck and build clean. In-app billing screens and the /demo/proposal sample customer estimate keep their figures.


## Sitewide workspace readiness
- [x] Audit all authenticated views; replace unavailable module routes with native views and explicitly labeled screen-only samples. Existing reports, tariffs, dispatch and field signing remain live.
- [x] Add interactive expense examples, invoice history, catalog/storage assignments, operations/trip schedules, printable document/signature previews and camera/manual scanning. Unmigrated ledger writes, warehouse transfers and external messaging remain illustrative, not persisted operations.
- [x] Remove legacy workspace headers and help branding; 24 signed-in screens, expense entry/filter, signature validation, camera start/stop, pipeline dialog, mobile overflow and Russian headings verified; 14 targeted tests pass.

## Reports and tariffs readiness
- [x] Replace legacy Reports with completed-move revenue, count, average order value and crew metrics; empty workspaces show labeled UI-only examples.
- [x] Replace legacy Tariffs with atomic admin pricing/travel/fuel saves and workspace branding; truck fee feeds new estimates.
- [x] Verify signed-in Reports, English/Russian switching and tariff save/reload/restore; 16 rule tests pass and preview checks are clean.

## Workspace appearance
- [x] Add five-preset gallery, eight accents and masked glass wallpapers with opaque tables, charts and inputs; verified 40 palette combinations with minimum 5.36:1 body/muted/button contrast.
- [x] Persist scoped local preferences and manager-controlled workspace settings; verified saved theme/accent and private wallpaper after reload, phone layout, invalid-image fallback and 403/400/401 rejection paths. Nine targeted tests pass.

## Field documentation and offline execution
- [x] BOL, damage acknowledgment and furniture inspection with embedded signatures.
- [x] Immutable signed PDF with inspection photos and secure download; visually checked all pages and fixed orphaned headings.
- [ ] Automatic customer and office email links (blocked: sender domain not configured).
- [x] Guarded field PWA and user/workspace-scoped IndexedDB sync; phone-size offline photos/checklist/signature/stages replay verified; 13 tests passed. Published service-worker installation remains unverified until deployment.

## Internal testing readiness
- [x] Add shared database-backed 10/minute/IP quote and lead intake limit; verified request 11 returns 429, aliases share budget, and preflight stays available.
- [x] Add preview-only admin manual approval/booking from job dashboard; verified saved booking, active proposal approval, no payment receipt, and 18 targeted tests.

## SmartMoving alternative landing
- [x] Add /smartmoving-alternative: hero, six-row capability matrix, "Built for Crews in the Field" and "Transparent ROI" cards, "Try MoveFlew Free" and "View Live Demo" CTAs; matrix and cards also embedded in /pricing.
- [x] Add /demo/proposal sample customer proposal (illustrative data only, noindex) as the live-demo target; verified desktop/phone layout, navigation and no console errors; 93 tests pass.

## Public pricing page (B2B SaaS)
- [x] Replace consumer moving-labor rates with MoveFlew subscription pricing: beta $0 (all features), post-beta preview $99/mo flat, unlimited users, no card or contract; SmartMoving price comparison card; "Get Free Beta Access" CTA to /register.
- [x] Verified headline/badge/plan cards/comparison rows render on desktop and 390px phone with no overflow, Pricing added to SaaS navigation and both footers, and CTAs reach /register.

## SaaS homepage pivot
- [x] Redesign homepage with light palette, email signup handoff, interactive dispatch/signature previews and bento showcase; verified desktop/mobile navigation, signup email prefill, no overflow or runtime errors.
- [x] Polish hero grid/beta badge, dark feature previews and CTA glow; verify homepage navigation and layout.
- [x] Apply MoveGrid branding, cube logo, new hero copy and verify public navigation.
- [x] Replace local moving homepage with B2B CRM positioning and five feature cards.
- [x] Wire beta signup and a working SmartMoving comparison destination.
- [x] Verify homepage and CTA navigation on desktop and mobile.

## Crew onboarding refresh
- [x] Verify safe invitation revocation, toast feedback, and pending-only actions.
- [x] Refresh the branded invitation card, mobile and dark appearance, fields and loading/error states.
- [x] Support /invite/:token alongside /join-crew and verify registration saves a worker and opens /app/field.

- [x] Phase 1a: design, marketing pages, contact form
- [x] Phase 1b: Cloud login, workspaces + core records API (customers, jobs, trucks, crew, reminders, pricing, members), workspace shell mounted
- [ ] Phase 2: verify signed-in flow; pipeline, tariffs, dispatch timeline, storage, billing, reports APIs; teammate invites
- [ ] Phase 3: workers/payroll, storage/warehouse, billing, claims, tariffs
- [ ] Phase 4: messaging (Twilio/SendGrid), Stripe payments, QuickBooks, automation, engagement
- [ ] Phase 5: public token pages, webhooks, schedules
- [ ] Phase 6: import records + users, verify (blocked on data export)

## Master update (Oct 28)
- [x] Cancelled/declined excluded from revenue + open opportunities
- [x] Admin-only job/estimate delete with confirmation
- [x] Mobile wrapping for links/table cells
- [x] Direct URLs / reloads under /app work (no 404)
- [x] Worker invites (/join-crew links + email) with Driver/Helper/Crew Lead roles
- [ ] Phone SMS login (blocked: needs SMS provider choice)
- [x] Google Maps drive time (base→pickup→drop-off→base) + workspace travel/fuel rules with per-estimate override; onboarding prompt for base address not added
- [x] Public quote intake with credential-scoped workspace delivery, idempotency, validation, and Leads read-back verified; /api/public/v1/quotes is canonical, /api/v1/public/quotes is a compatibility alias
- [ ] Connect northwestmovingcrew.com production form (blocked: external website access and publishing)
- [x] Customer-visible proposal snapshots, share links and persisted digital signatures verified
- [x] Stripe deposit checkout (amount from stored proposal) + webhook → booked (live only); test payment untried
- [x] Workspace fixed/percentage deposit settings and office proposal-level override with calculation tests
- [ ] Move storage vaults, timecards, invoices to dedicated tables
- [x] Website Integration Hub (/app/settings/integrations): widget, form webhooks, API keys
- [x] CrewAI Assistant floating copilot on /app/* (help + navigation links, role/workspace-scoped)

## Tenant onboarding & billing (in progress)
- [x] /register company signup → own workspace, admin role
- [x] /app/onboarding 3-step wizard + skip ($0 defaults)
- [x] /app/settings/billing (Beta Access, DB-configured plans)
- [x] Read-only enforcement when past due / canceled
- [ ] Paid plans + Stripe portal (waiting: user to define tiers)

- [x] Load Demo Job button (overview, dispatch, field) + in-app feedback/bug modal
