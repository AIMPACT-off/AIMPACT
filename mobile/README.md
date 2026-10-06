# AIMPACT Mobile

A real Android/iOS application shell for the AIMPACT customer product.

- Android package: ai.aimpact.app
- iOS bundle: ai.aimpact.app
- Customer surface: https://aimpact-ai.netlify.app/platform.html
- Android/iOS are built from the same Expo project.
- The app keeps the existing customer web product and its server-side payment flow; it does not duplicate payment credentials in the native client.

## Local build

`npm install`
`npx expo start`

## Device builds

Preview/internal:
`npx eas build --platform android --profile preview`
`npx eas build --platform ios --profile preview`

Production:
`npx eas build --platform all --profile production`

A real APK/IPA/TestFlight build requires an Expo/EAS project account and signing credentials. The source and build configuration are committed here; no binary is claimed until a build artifact is actually produced.
