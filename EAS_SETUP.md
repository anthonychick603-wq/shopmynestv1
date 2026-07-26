# EAS / Play Store setup — remaining manual steps

`eas.json` and the Play-Store-relevant fields in `app.json` are prepared. Everything left below
needs **your own Expo and Google credentials**, so it could not be done for you.

## Not set, on purpose

`expo.owner` and `expo.extra.eas.projectId` are deliberately absent. Both are written by
`eas init`, which requires an authenticated Expo account. Do not hand-write them — the
projectId must match a real project on Expo's servers.

Two things stay broken until `eas init` runs:

- EAS builds are not linked to a project.
- **Push notifications are silently disabled.** `registerPushToken()` in
  `src/context/AuthContext.tsx:43-46` reads `extra.eas.projectId` and returns early when it is
  missing, so `getExpoPushTokenAsync` is never called and no device token is registered. This
  fails quietly by design — it will start working on the first build after `eas init`, with no
  code change needed.

## Steps

```bash
npm install -g eas-cli     # eas-cli is not installed in this environment
eas login                  # your Expo account
eas init                   # writes expo.owner + expo.extra.eas.projectId into app.json
eas build --platform android --profile production
```

`eas build` will offer to generate an **upload keystore** and keep it on Expo's servers. Accept
this for a first submission, then immediately `eas credentials` → download a backup. Losing this
keystore means you can never update the app under this package name again.

### First Play Store upload must be manual

Google does not allow the *first* artifact for a new package to arrive via API, so
`eas submit` cannot create the listing. For the first release:

1. Create the app in the Play Console under package `com.thenest.marketplace`.
2. Upload the `.aab` from `eas build` by hand.
3. Complete the Play Console questionnaires (Data safety, content rating, target audience,
   privacy policy URL). Data safety must declare the photo-library access and the account
   data the app collects.

After that first upload, `eas submit --platform android --profile production` works. It is
preconfigured to push to the `internal` track as a `draft`; you will need a Google Play service
account JSON key, and EAS will prompt for its path.

## Version numbering

`cli.appVersionSource` is `"local"`, so `app.json` is the source of truth. The production
profile has `autoIncrement: true`, which bumps `android.versionCode` **in this file** on each
production build — commit that change. `versionCode` starts at 1; Play rejects any upload whose
versionCode is not strictly greater than the previous one.

## Before OTA updates will work

`runtimeVersion` is set to `{"policy": "appVersion"}`, but `expo-updates` **is not installed**,
so nothing is served over the air yet. To enable:

```bash
npx expo install expo-updates
eas update:configure
```

Note that with the `appVersion` policy the runtime version tracks `expo.version`, so every patch
bump creates a new OTA target — an update only reaches builds sharing its exact version. Switch
to a manual `runtimeVersion` string if you want one OTA channel to span several app versions.
