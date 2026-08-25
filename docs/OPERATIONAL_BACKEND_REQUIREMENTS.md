# ShopMyNest Operational Backend Requirements

The mobile client now closes every operational loop that can be enforced with the APIs present in v1.0.169. The remaining queues require server-side admin endpoints; adding client-only placeholders would create non-functional controls.

## 1. Unified admin operations summary

`GET /the-nest/v1/admin/operations`

Return counts and oldest-item age for:

- seller applications awaiting review
- refund requests awaiting review
- buyer-protection disputes awaiting seller/admin action
- payout requests awaiting processing
- failed/returned payouts
- shipping/label exceptions
- stale processing orders
- pending moderation reports

Suggested response:

```json
{
  "seller_applications": { "count": 0, "oldest_hours": 0 },
  "refunds": { "count": 0, "oldest_hours": 0 },
  "disputes": { "count": 0, "oldest_hours": 0 },
  "payouts_pending": { "count": 0, "oldest_hours": 0 },
  "payouts_failed": { "count": 0, "oldest_hours": 0 },
  "shipping_exceptions": { "count": 0, "oldest_hours": 0 },
  "order_exceptions": { "count": 0, "oldest_hours": 0 },
  "reports": { "count": 0, "oldest_hours": 0 }
}
```

## 2. Seller application admin queue

`GET /the-nest/v1/admin/seller-applications?status=pending`

Each row must include application id, seller id/name/email, store name, about, products/categories, submitted_at, status, rejection_reason, reviewed_at, reviewed_by, and can_resubmit.

Actions:

- `POST /admin/seller-applications/{id}/approve`
- `POST /admin/seller-applications/{id}/reject` with `{ "reason": "...", "can_resubmit": true }`

The existing seller-facing `/seller/application/status` should return `rejection_reason`, `reviewed_at`, and `can_resubmit`; the v1.0.170 client already consumes these fields when available.

## 3. Refund admin queue

`GET /the-nest/v1/admin/refunds?status=requested`

Each row must include order, buyer, sellers affected, requested amount, reason/details, current dispute id if any, payout-hold state, submitted_at, age/SLA, and audit history.

Actions must be idempotent:

- `POST /admin/refunds/{order_id}/approve`
- `POST /admin/refunds/{order_id}/deny` with a required note
- `POST /admin/refunds/{order_id}/process`

Server rule: an order may not have a separate active refund request and active dispute representing the same unresolved issue. Escalation should link the refund case to the dispute rather than create an unrelated money-action record.

## 4. Payout admin queue and ledger

`GET /the-nest/v1/admin/payouts?status=pending|processing|failed|returned`

Each row must include payout id, seller, requested amount, destination mask, created/requested/processed timestamps, status, failure reason, retryability, and ledger reconciliation total.

Actions:

- `POST /admin/payouts/{id}/process`
- `POST /admin/payouts/{id}/retry`
- `POST /admin/payouts/{id}/cancel`

The seller ledger should reconcile sale gross, platform fee, card processing fee, shipping debit/credit, refunds, adjustments, reserved amounts, and payout ids. A balance endpoint failure must never be serialized as a zero balance.

## 5. Fulfillment transition enforcement

The mobile client now restricts seller transitions, but the server remains authoritative. `PUT /seller/orders/{id}` must reject invalid transitions.

Recommended rules:

- `processing -> processing | shipped | cancelled`
- `shipped -> shipped` from seller UI; delivery/completion comes from trusted tracking/admin workflow
- `completed` terminal
- `cancelled` terminal
- manual `shipped` requires a tracking number
- label purchase may atomically set carrier/tracking/shipped state

Return `allowed_actions` or `allowed_statuses` on seller-order payloads so future clients do not duplicate the state machine.

## 6. Shipping accounting source of truth

For every seller order return explicit fields such as:

```json
{
  "platform_keeps_shipping": true,
  "label_cost_responsibility": "platform",
  "label_cost": 5.67,
  "seller_net": 24.30
}
```

If `platform_keeps_shipping=true`, label purchase must not create a seller postage debit. Legacy orders may retain seller-paid label behavior, but it must be identified explicitly instead of inferred from missing fields.

## 7. Operational event monitoring

Add server-side structured events for:

- checkout intent creation failure
- payment completion/webhook mismatch
- custom quote accepted but private product unavailable
- label rate/purchase failures
- refund/dispute creation and resolution
- payout request/process/failure/return
- seller application decision

Each event should include timestamp, user/seller id where applicable, order/case/payout id, error code, request correlation/idempotency token, app version, and platform. Alert on repeated failures and aged queue items.
