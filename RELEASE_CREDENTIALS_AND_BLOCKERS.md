# AIMPACT Release Credential Matrix
Status: operator checklist; credential values must never be committed or pasted into chat.

## 1. GitHub Repository Actions secrets

### Store verification gate (`.github/workflows/native-store-qa.yml`)
Required secret names are derived from the current workflow, not a generic five-key list:

- `EXPO_TOKEN`
- `APPLE_ISSUER_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` **or** `APPLE_PRIVATE_KEY_BASE64`
- `APPLE_BUNDLE_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`
- `GOOGLE_PACKAGE_NAME`

The Apple private key must be a valid App Store Connect API key. The Google service account JSON must match the email and have Play Console access to the target app. The workflow validates that the Quick Audit IAP product `ai.aimpact.quick_audit` exists; it does not prove an actual store purchase.

### iOS TestFlight upload
The current `ios-device-release.yml` also needs the Apple API key and bundle ID to create signing assets and upload the IPA. It must pass the exact source-build provenance gate before signing/uploading.

### Android Play upload
`EXPO_TOKEN` is required for EAS build/submit. Google service-account access must be configured for the actual EAS submit path, not merely present for the preflight product lookup. Confirm the EAS submit profile is non-interactive and targets the intended Play track before enabling submission.

## 2. Netlify environment variables
- `TOSS_CLIENT_KEY`: client-side checkout key, never use as server authorization.
- `TOSS_SECRET_KEY`: server-side secret, only in Netlify server environment / protected CI secrets.
- Supabase server-side variables required by the deployed Toss functions must be configured in Netlify as documented in those functions; never expose service-role keys in browser bundles.

Secret presence is not payment integration proof. Toss E2E remains unverified until a sandbox payment is created through the real checkout flow, server confirmation is accepted, the payment ledger is written once, the matching entitlement is granted, and duplicate/retry behavior is tested.

## 3. Evidence gates (do not collapse these statuses)
- `CODE_GATE_PASS`: static/unit checks pass.
- `MOBILE_BUILD_PASS`: APK, Android runtime, iOS simulator and release gate pass on one exact SHA.
- `STORE_PRODUCT_GATE_PASS`: Apple and Google product lookups pass using credentials.
- `IPA/AAB_CREATED`: signed/release binary exists and is attached as an artifact.
- `STORE_UPLOAD_ACCEPTED`: provider confirms upload/submission accepted.
- `TOSS_E2E_PASS`: real sandbox transaction, ledger and entitlement chain verified.
- `SALES_SENT_VERIFIED`: outbound message send/delivery evidence exists.
- `PAID_REVENUE_VERIFIED`: provider transaction and matching ledger record confirm payment net of refunds.

A build, a mock QA run, a configured secret, or a PR merge cannot substitute for any later gate.
