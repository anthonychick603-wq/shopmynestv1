# v1.0.173 release fixes

- Reviews final server tax/shipping/total before opening Stripe PaymentSheet.
- Uses one atomic API call for account contact + address-book saves.
- Requires the same complete address fields that checkout requires.
- Restricts Blog Moderation to explicit admin role in both entry point and screen guard.
- Separates pre-shipment cancellation wording from post-delivery return/refund wording.
- Enables EAS production auto-increment and standardizes the project on npm/package-lock.
- Extends operational regression checks for these release fixes.
