# The Nest category taxonomy backend

This folder contains the WordPress compatibility module for the mobile category/sub-category feature.

## Baseline

Target backend: **MyNest Unified Marketplace v3.13.48**.

The existing marketplace backend already accepts WooCommerce `product_cat` IDs through `category_ids`. This module adds the missing two-level contract without touching checkout, Stripe, shipping, payouts, orders, taxes, or authentication.

## What it does

- Seeds major WooCommerce product categories and their child sub-categories.
- Includes `Sewing -> Men's Apparel` and the rest of the initial marketplace taxonomy.
- Ensures `GET /wp-json/the-nest/v1/categories` includes a numeric `parent` field.
- Validates published seller product writes so they use one major category and one valid child sub-category when children exist.
- Automatically adds the parent category when a website client submits only a child category.
- Allows incomplete category selection for product drafts.
- Converts seller-application category paths into structured category/sub-category IDs and stores them for admin review.
- Enriches the admin seller-application API with the saved category selections and readable paths.

## Deployment

For the current v3.13.48 backend, place `mynest-category-taxonomy-compat.php` in its own WordPress plugin folder and activate it **after** WooCommerce and MyNest Unified Marketplace.

Recommended production follow-up: fold this class into the next MyNest Unified Marketplace release (for example v3.13.49), then remove the temporary compatibility plugin after confirming the integrated release performs the same migration and REST hooks.

## Verification

1. Activate the module on staging.
2. Confirm WooCommerce Products -> Categories shows the major categories with nested children.
3. Confirm `/wp-json/the-nest/v1/categories` returns `parent: 0` for major categories and the parent term ID for sub-categories.
4. Submit a seller application with two category paths and verify the admin queue shows both.
5. Publish a listing with `Sewing -> Men's Apparel`; verify the product is assigned to both terms.
6. Try publishing a category with a child missing and verify the API returns HTTP 422.
7. Save the same incomplete listing as a draft and verify it succeeds.
8. Verify checkout, multi-seller shipping fees, payment finalization, and payouts are unchanged.

The PHP source was syntax-checked with PHP 8.4 before being committed.
