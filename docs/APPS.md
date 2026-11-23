# SalonMind apps — Android, Windows, Mac, Linux

Both apps are thin, fast shells around the live website (`apps/version.json → url`):

| App | Technology | Where to get it |
|---|---|---|
| Android 7.0+ | Trusted Web Activity (`apps/android`, Google's `androidbrowserhelper`) — real Chrome, full screen | Website → **Get the app** (`/download`, QR code) or `public/downloads/SalonMind.apk`; also on the GitHub release |
| Windows / Mac / Linux | Electron (`apps/desktop`) | GitHub release *SalonMind apps …* (built by `.github/workflows/apps.yml`) |
| Any desktop browser | Installable web app (manifest) | `/download` → **Install in one click** |

## Updates — no reinstall

1. **Features, fixes, translations, agents:** they live on the website. Every push to `main` deploys Vercel/Render and
   every installed app shows the new version the next time it opens. Nothing to download.
2. **The shell itself** (icon, splash, package settings — rarely changes): each app opens `/open?shell=<kind>&v=<version>`,
   which remembers the running version. When `apps/version.json` has a newer one:
   * Android shows an **Update app** banner; the new APK installs *over* the old one (same package, same signing key),
     keeping sign-in and settings.
   * Desktop shows an update dialog on launch that opens the latest installer; installing over the old version keeps
     everything (data lives online).

   Fully silent background updates of the shell need an app store (Google Play has a one-time developer fee), which is
   why the free route uses the one-tap in-place update instead.

## Releasing a new shell

```bash
# 1. bump versions (keep apps/desktop/package.json "version" equal to desktop.version — a unit test checks this)
$EDITOR apps/version.json apps/desktop/package.json
# 2. Android: build + sign, copy to public/downloads (needs apps/android/keystore.properties or the CI secrets)
npm run app:android
# 3. commit & push — CI builds the desktop installers and attaches everything to a GitHub release
```

## Signing key (keep it safe)

Android only installs an update when it is signed with the **same key** as the installed app. The key is *not* in the
repository. Keep the backup you were given (`salonmind-android-signing.zip`) somewhere safe, then:

* **Local builds:** create `apps/android/keystore.properties` (git-ignored):
  `storeFile=/path/salonmind-release.jks`, `storePassword=…`, `keyAlias=salonmind`, `keyPassword=…`
* **CI builds:** add repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 salonmind-release.jks`),
  `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`. Without them CI still compiles the Android app as a check
  but does not publish an APK.

The key's SHA-256 fingerprint is published in `public/.well-known/assetlinks.json`, which lets Android open the site
inside the app without a browser bar.

## Build requirements (local)

* Android: JDK 17+, Android SDK platform 36 (`ANDROID_HOME` or `apps/android/local.properties`), then `npm run app:android`.
* Desktop: Node 22, `npm run app:desktop` builds for the current OS (`apps/desktop/dist`).
* Icons for all platforms come from the app's own scissors mark: `npm run icons`.
