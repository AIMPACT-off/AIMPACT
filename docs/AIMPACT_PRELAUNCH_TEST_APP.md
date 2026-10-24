# AIMPACT Prelaunch Test App Runbook

## What this build is
- Android package: `ai.aimpact.app.test` (installable APK)
- iOS bundle ID: `ai.aimpact.app.test` (simulator artifact; physical-device build is a separate EAS profile)
- App label: `AIMPACT TEST`
- A persistent visible banner identifies test builds.
- Production identity stays `ai.aimpact.app`; standard CI/EAS production profiles explicitly set `APP_VARIANT=production`.

## Build and retrieve artifacts
1. Open GitHub Actions: https://github.com/AIMPACT-off/AIMPACT/actions/workflows/mobile-test-app.yml
2. Open the latest successful **AIMPACT Prelaunch Test App** run.
3. Download `AIMPACT-TEST-Android-APK` for Android.
4. Download `AIMPACT-TEST-iOS-Simulator` only for the iOS Simulator on a Mac. It is not an iPhone-installable IPA.
5. Verify the Android APK SHA-256 using the accompanying `.sha256` file before installing.

## Install Android test APK
1. Transfer the APK to the Android test device.
2. Allow installation from the chosen file source if Android asks.
3. Install and open **AIMPACT TEST**.
4. Confirm the orange `TEST BUILD · NOT FOR PRODUCTION` banner is visible.
5. Do not uninstall or overwrite the production AIMPACT app; the test package is separate.

## Backend isolation — deliberately fail-closed
The test build must never fall back to production services. Without dedicated test environment values, sign-in, API calls, and purchase flows remain unavailable/blocked by design.

Configure only after a separate staging backend has been approved:
- `EXPO_PUBLIC_TEST_SUPABASE_URL`: dedicated test Supabase project URL
- `EXPO_PUBLIC_TEST_SUPABASE_ANON_KEY`: that project's publishable/anon key (never service-role)
- `EXPO_PUBLIC_TEST_API_BASE_URL`: dedicated test/staging API origin, not the production site
- `EXPO_PUBLIC_TEST_IAP_ENABLED=true`: optional, only when sandbox IAP testing is intentionally enabled

These are public client settings, not service credentials. Never add `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`, or other server secrets to the mobile app or `EXPO_PUBLIC_*` variables.

## Physical iPhone installation
The CI artifact is a simulator build. To install on a physical iPhone, use EAS profile `test-ios-device` after Apple Developer signing and device registration are configured. App Store Connect API access alone does not prove that ad-hoc provisioning and device registration are ready.

## Release gate
A successful app build/runtime test proves packaging and launch only. It does not prove Toss payment E2E, store purchase verification, production backend readiness, App Store approval, or release completion.
