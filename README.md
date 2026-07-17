# The Nest Android App — Version 1.0.7

This is the native Expo/React Native Android project for **shopmynest.com**. The ZIP is packaged so `package.json` is directly inside the extracted project folder.

## Required website plugin

Keep **MyNest Mobile App Bridge 1.1.0** active in WordPress. A copy remains included at:

```text
wordpress-plugin/mynest-mobile-app-bridge-v1.1.0.zip
```

You do not need to reinstall the bridge when version 1.1.0 is already active.

## Changes in 1.0.7

### Natural brand palette

The supplied natural palette is now applied throughout the app:

- Peachtree — `#F29F82`
- Forest — `#294B32`
- Sunflower — `#F4C84B`
- Mist — `#F6F3F0`
- Stream — `#A9CDE5`
- Meadow — `#B4C96F`
- Blossom — `#FFD9CC`
- Fern — `#6FA05A`
- Earth — `#20221E`

Forest is the main action color, Mist is the primary app background, Sunflower is the main accent, Blossom is used for soft surfaces, Meadow is used for natural borders and success surfaces, Stream is available for informational areas, and Earth is the main text color.

The update covers buttons, selected category and sort pills, navigation, cards, fields, placeholders, alerts, unread notifications, seller callouts, checkout errors, success states, notification lights, splash/background colors, and Android adaptive icon colors. The app icon and splash artwork were also recolored to Forest and Sunflower for a brighter branded look.

The Expo SDK 54 font dependency is now pinned directly (`expo-font` 14.0.12 with `@expo/vector-icons` 15.0.3) to avoid duplicate native font modules in APK builds.

Darker semantic shades are used for error, warning, and success text where the original palette color would not provide enough contrast.

### Existing fixes retained

- Shop categories remain separated from sorting controls.
- Alerts support the fallback authentication header.
- Cart checkout remains above the bottom navigation.
- Checkout refreshes tax and shipping totals before order creation.
- Metro includes `babel-preset-expo` and the locked dependency set.

## Windows setup

Extract the ZIP to:

```text
C:\TheNest\the-nest-android-app-v1.0.7
```

Confirm these files are directly inside that folder:

```text
package.json
App.js
app.json
setup-windows.cmd
src
assets
```

Then run:

```powershell
cd C:\TheNest\the-nest-android-app-v1.0.7
npm.cmd install
npx.cmd expo start --clear
```

Open Expo Go on the Android phone and scan the QR code. The computer and phone should be on the same Wi-Fi network. If LAN mode cannot connect, run:

```powershell
npx.cmd expo start --tunnel --clear
```

Do not copy an older `node_modules` folder into this project.

## APK build

For complete Stripe, notifications, Google Pay, and native configuration testing:

```powershell
cd C:\TheNest\the-nest-android-app-v1.0.7
npx.cmd eas login
npx.cmd eas init
npx.cmd eas build --platform android --profile preview
```

The preview profile creates an APK. The production profile creates an Android App Bundle for Google Play.

## Website configuration checks

Keep these plugins active:

- WooCommerce
- WooCommerce Stripe Gateway
- MyNest Unified Marketplace
- MyNest Mobile App Bridge 1.1.0

Also verify:

- Both WordPress address fields use `https://shopmynest.com`.
- The Native Checkout page has the correct Stripe publishable key, secret key, currency, shipping values, and webhook secret.
- Stripe test keys are used only for testing.
- Stripe secret keys remain on WordPress and are never placed in the Android source.

## Main app features

- One-column home feed
- Searchable two-column shop
- Native product and cart screens
- Native Stripe PaymentSheet checkout
- Persistent cart and duplicate-charge protection
- Buyer accounts, addresses, order history, tracking, messages, and alerts
- Seller application, dashboard, listings, orders, shipping profiles, labels, earnings, and payouts
- Safe Android system-navigation spacing
- Seller-only controls hidden from buyers
- Become-a-seller controls hidden after approval
- Correct decoding of category names containing HTML entities
