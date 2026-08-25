# ShopMyNest Mobile v1.0.170 — Operational Process Fixes

## Fixed in the mobile app

- Custom quote acceptance now adds the private product directly to the native cart. The browser/WooCommerce cart handoff was removed.
- Accepted custom quotes use an idempotent `ensureProduct` cart path so repeated Pay now taps do not duplicate the one-off item.
- Payout balance API failures now render an explicit unavailable/retry state instead of looking like a `$0.00` balance.
- Payout copy is consistent with the API that exists: 7-day hold, then seller-requested ACH payout.
- Shipping-label cost messaging now respects `platform_keeps_shipping`; platform-covered postage is never described as a seller deduction.
- Seller fulfillment choices are constrained. Sellers can no longer arbitrarily jump to Completed, and manual Shipped requires tracking.
- Buyer refund/dispute handling is coordinated through one order-level Resolution Center.
- A refund in progress suppresses duplicate dispute creation.
- An existing buyer-protection case suppresses duplicate refund initiation on the order screen.
- Direct navigation to the dispute composer performs server checks for existing cases/refunds before creating another case.
- Disputes now support up to five evidence photos and upload their URLs through the existing media API.
- Seller-application update notifications route to the seller application screen.
- Refund, dispute, and custom-request notification routes were added.
- Alerts no longer show a dead Open button when a notification has no actionable destination.
- Rejected seller applications can display a backend-provided rejection reason and resubmission eligibility.
- Checkout success copy now says payment/order confirmation instead of incorrectly saying the order is already on its way.
- Apple Pay merchant identifier is centralized through Expo config and Stripe provider code so the native plugin and runtime use the same value.
- Added an Admin Operations screen using currently available APIs for order exceptions, open buyer-protection cases, and pending moderation reports.
- Added `npm run audit:operations`, a zero-dependency regression check for the operational invariants changed in this release.

## Server work still required

The mobile archive does not contain the ShopMyNest WordPress/API backend. Full admin queues for payout failures, refund review, and seller-application review therefore cannot be implemented from this archive alone. See `docs/OPERATIONAL_BACKEND_REQUIREMENTS.md` for the exact endpoint/state-machine requirements.

Apple Pay also requires the merchant identifier `merchant.com.shopmynest.app` to actually exist and be enabled for the production Apple developer account. The app configuration is now internally consistent, but external Apple registration cannot be performed from source code.
