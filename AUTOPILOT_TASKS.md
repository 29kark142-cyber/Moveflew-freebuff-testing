# Autonomous Execution Queue for MoveFlew (15-Task Super Batch)

---

### Task 1: Financial Analytics & Trip Margin Tracking (`/app/finance`)
- [x] Build workspace financial overview at `/app/finance` tracking total revenue, labor costs, fuel expenses, and net profit margins.
- [x] Add expense logging to Job Sheets (crew wages, fuel/mileage, tolls, tip distributions).
- [x] Add date range filtering (This Month, Last Month, YTD) and CSV export for financial records.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 2: Packing Supplies & Add-On Store (`/quote/:token` & Job Sheet)
- [x] Upgrade booking portal `/quote/:token` with selectable packing materials (boxes, bubble wrap, covers) and add-on services (TV dismounting, safe handling).
- [x] Dynamically update deposit calculations, line items, and Stripe payment total.
- [x] Render itemized "Packing & Materials Checklist" on the Crew Job Sheet (`/app/jobs/:id`).
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 3: Mobile Field App Driver Check-In UI (`/app/field`)
- [x] Add interactive milestone check-in buttons ("En Route", "Arrived at Pickup", "In Transit", "Arrived at Unload") to the mobile field page `/app/field`.
- [x] Connect buttons to `POST /api/field/jobs/:id/checkin` capturing GPS coordinates and notes.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 4: Operations Control & Alert Center (`/app/dashboard`)
- [x] Build real-time operations overview on `/app/dashboard` showing unassigned jobs, pending deposits, declined shift alerts, and active driver milestones.
- [x] Add quick-action shortcuts to jump directly to flagged items on `/app/schedule` or job sheets.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 5: QR Code Inventory & Box Scanning Engine (`/app/inventory`)
- [x] Generate unique QR code labels for customer inventory items/boxes during packing.
- [x] Build mobile QR code scanner page at `/app/inventory` for field crew to mark items "Loaded on Truck" and "Unloaded at Destination".
- [x] Expose missing item alerts on the Job Sheet if scanned count doesn't match origin count.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 6: Customer Self-Service Portal (`/portal/:token`)
- [x] Create tokenized customer management portal at `/portal/:token`.
- [x] Allow clients to request move date changes, update address details, upload inventory photos, and download invoices/estimates.
- [x] Send automated dispatcher notification whenever a customer requests schedule changes.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 7: Claims, Damage Intake & Resolution Module (`/app/claims`)
- [x] Create a customer claim submission form for reported damage or missing items.
- [x] Build admin resolution dashboard at `/app/claims` with status tracking (Pending, Under Review, Approved, Payout Issued, Rejected).
- [x] Integrate claim settlement payout logging with the Job Sheet and Financial Analytics module.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 8: Crew Payroll & Automated Tip Distribution Engine (`/app/payroll`)
- [x] Build crew payroll calculator at `/app/payroll` deriving total pay from logged shift hours and hourly role rates.
- [x] Add tip allocation tool allowing dispatchers or clients to split electronic tips among assigned crew members.
- [x] Generate downloadable pay stub PDFs and payroll summary CSV reports.
- [x] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 9: Dynamic Surge Pricing & Peak Season Matrix (`/app/settings/pricing`)
- [ ] Add dynamic pricing rules UI at `/app/settings/pricing` to set peak season date ranges (e.g., end-of-month multipliers, weekend rate surcharges).
- [ ] Update route pricing engine (`/api/crm/quote`) to automatically apply active surge multipliers during calculation.
- [ ] Display transparent surge pricing breakdowns on customer quotes.
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 10: Fleet Maintenance Log & Vehicle Inspection Checklist (`/app/fleet`)
- [ ] Build fleet management portal at `/app/fleet` tracking trucks, mileage, license plates, and service schedules.
- [ ] Add pre-trip vehicle inspection checklist for drivers before shift start (oil, tire pressure, ramps, straps).
- [ ] Block assignment of trucks marked "In Maintenance" on the Dispatcher Schedule (`/app/schedule`).
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 11: Storage Vault Monthly Billing Automation (`/app/storage/billing`)
- [ ] Add recurring monthly billing generator for long-term vault storage units in `/app/storage`.
- [ ] Automate recurring Stripe charge invocations or invoice emails for active vault rentals.
- [ ] Display overdue storage account badges on the main Storage Vault page.
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 12: Digital Bill of Lading (BOL) Legal Signature Flow (`/app/jobs/:id/bol`)
- [ ] Build compliant digital Bill of Lading generator rendering contract terms, itemized valuation, and final pricing.
- [ ] Add touch/mouse canvas signature capture for origin pickup and destination delivery sign-offs.
- [ ] Generate signed PDF output using `pdf-lib` and attach directly to job documents.
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 13: Post-Move Review & Automated Feedback Loop
- [ ] Create automated post-move review request dispatch system triggered upon job status reaching `completed`.
- [ ] Send SMS/Email with 1-5 star rating portal; 5-star reviews prompt direct Google Business Review redirect, while lower ratings trigger internal escalation alerts.
- [ ] Display review score metrics on `/app/dashboard`.
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 14: Multi-Branch & Franchise Workspace Support (`/app/branches`)
- [ ] Add multi-branch context selector in top nav allowing users to toggle between different office locations.
- [ ] Scope jobs, schedules, trucks, and financial records by branch ID.
- [ ] Create aggregated multi-branch performance dashboard for enterprise admins.
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.

---

### Task 15: Automated Marketing & Re-Engagement Engine (`/app/marketing`)
- [ ] Create automated customer re-engagement campaign tool at `/app/marketing`.
- [ ] Trigger automated follow-ups for expired quotes, unconfirmed estimates, and annual move anniversary check-ins.
- [ ] Track email/SMS open rates, link clicks, and converted bookings.
- [ ] Ensure `npx tsc --noEmit`, `bun run test`, and `bun run build` pass before marking complete.
