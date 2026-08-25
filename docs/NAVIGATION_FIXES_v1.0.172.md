# ShopMyNest Mobile v1.0.172 — Navigation + Address Fixes

- `safeBack()` now pops the real Expo Router stack when possible and **honors each screen's natural fallback** only when no history exists.
- Android hardware/gesture back uses the same rule on `(more)` screens.
- Removed retired parallel navigation-history/referring-tab trackers from the root layout.
- Forgot-password screens now use the shared back rule instead of raw `router.back()`.
- Admin queue deep links fall back to Operations instead of Home.
- Address Book's invalid `/(tabs)/more` fallback is corrected to Account.
- Seller Ship-from Address now has an explicit in-app back button/header.
- Edit Address now shows only one Phone field (below Email). That value is mirrored into the saved shipping address phone for carrier labels.
