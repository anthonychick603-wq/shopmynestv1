=== MyNest Mobile App Bridge ===
Contributors: mynest
Tags: woocommerce, marketplace, mobile app, android
Requires at least: 6.5
Tested up to: 7.0
Requires PHP: 8.0
Stable tag: 1.1.0
License: GPLv2 or later

Mobile API additions and compatibility support for The Nest Android app.

== Description ==

This companion plugin works with WooCommerce and MyNest Unified Marketplace. It provides buyer order history, product reporting, seller application status, buyer profile photo uploads, reliable mobile bearer-token authentication through reverse proxies, and a Stripe Tax Sandbox checkout fallback.

The Stripe Tax fallback runs only while Stripe Tax is set to Sandbox/Test mode. It never bypasses Stripe Tax live-mode failures.

== Changelog ==

= 1.1.0 =
* Added X-MyNest-Token authentication fallback for hosts that strip Authorization headers.
* Added explicit REST request authentication before protected route permission checks.
* Fixed Alerts, messages, orders, and other protected app routes returning Authentication is required after a successful login.
* Added Stripe Tax Sandbox fallback so a failed test tax request does not block WooCommerce block checkout.
* Added a mobile health endpoint.

= 1.0.1 =
* Declared WooCommerce HPOS and Cart/Checkout block compatibility.

= 1.0.0 =
* Initial release.
