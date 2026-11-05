# Website quote delivery

Quotes appear in the selected workspace's **Leads** list. No automated owner emails are sent yet; email sending requires a paid plan and a verified sender domain, then an owner-notification configuration.

1. In the target workspace, open **Settings → Pricing → Website quote intake** as an admin.
2. Generate the credential and copy it once into the marketing website's **server-side** secret store. Never put it in browser JavaScript or HTML. Regenerating replaces the old credential.
3. Publish the CRM before connecting the production website.
4. Send the website form from its server to:

```text
POST https://manus-to-makeover.lovable.app/api/public/v1/quotes
Authorization: Bearer <website credential>
Content-Type: application/json
Idempotency-Key: <unique submission ID, reused on retries>
```

```json
{
  "name": "Customer full name",
  "email": "customer@example.com",
  "phone": "3125550100",
  "origin": "Pickup address",
  "destination": "Delivery address",
  "moveDate": "2026-11-10",
  "moveSize": "2 bedroom",
  "message": "Optional customer notes"
}
```

Required: name, email, phone, origin, destination, moveDate. Optional: moveSize and message.

A 201 response contains only `{"received":true}`. Retries with the same submission ID create no additional lead. A 429 response means retry later. Keep the same ID on retries after a 503. Credentials determine the destination workspace; the caller cannot select a different workspace.

The requested `/api/v1/public/quotes` compatibility alias works locally, but published hosting bypasses site login only for `/api/public/*`. Use the endpoint above for reliable external delivery.

The CRM side is verified. Changing the actual form on northwestmovingcrew.com requires access to that website's source or form service and has not been performed here.

# Customer proposals

Workspace admins configure fixed USD or percentage defaults in **Settings → Pricing**. On an estimate's job page, office staff can override the deposit and select **Create proposal link**. Customers can review and sign the resulting `/proposal/:token` page without signing in. The saved proposal is a customer-visible snapshot; replacing an unsigned proposal invalidates its previous link. Signed proposals cannot be replaced.

Payment checkout and Stripe webhook delivery are not implemented because payment product creation was declined. Built-in test payments are enabled, but this is not a working deposit payment pipeline. No signature alone changes an estimate to booked. Live payments additionally require Payments-tab onboarding.