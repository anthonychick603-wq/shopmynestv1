# The Nest WordPress backend notes

This folder tracks WordPress-side changes that must stay compatible with the mobile app.

## Current integrated backend

Current packaged backend: **MyNest Unified Marketplace v3.13.52**.

The category/sub-category work that originally lived in `mynest-category-taxonomy-compat.php` has been folded into the unified marketplace plugin release line. The compatibility module remains here as historical/reference source only and should not be installed beside the integrated release unless specifically needed for recovery testing.

## Current backend responsibilities

- Two-level WooCommerce `product_cat` hierarchy shared by website and mobile app.
- Seller-application category/sub-category selections for admin review.
- Private application-only seller description; it is not copied into the public shop About field on approval.
- Handmade-only seller acknowledgement support.
- Product category-path validation for published listings while drafts may remain incomplete.
- Existing checkout, paid-order-only finalization, Stripe, shipping, payouts, taxes, authentication, and order-state contracts remain unchanged.

## v3.13.52

`releases/v3.13.52.patch` records the source delta from v3.13.51. It hardens the seller-application REST path so a WordPress.com/PHP runtime failure cannot be returned to the mobile app as a raw fatal HTML/CSS page. Admin-notification fan-out is best-effort after the application has been saved, and runtime failures are logged server-side instead of corrupting the REST response.

## Verification

1. Install the current unified marketplace ZIP on staging or production.
2. Confirm WooCommerce Products -> Categories shows major categories with nested children.
3. Confirm `/wp-json/the-nest/v1/categories` returns `parent: 0` for major categories and the parent term ID for sub-categories.
4. Submit a seller application with multiple category paths and verify the admin queue shows them.
5. Confirm the application-only description does not populate the seller's public shop About field after approval.
6. Confirm a seller-application notification failure cannot convert the submission response into a WordPress fatal page.
7. Verify checkout, multi-seller shipping fees, payment finalization, and payouts are unchanged.
