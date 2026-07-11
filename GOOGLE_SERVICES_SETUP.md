# Google services rollout

Mangadamia does not need every Firebase product to satisfy Google Play. The launch stack is limited to services that solve a product or security need.

## Required for launch push notifications

The app and API now support Expo push tokens, preferences, Android channels, spoiler-safe lock-screen copy, deep links, token revocation, and retrying pending database notifications.

Production credentials still have to be created outside the repository:

1. Link `app/` to an EAS project so `extra.eas.projectId` is generated.
2. Create a Firebase Android app matching `com.mangadamia.mangashelf`. Do not change this package after the first Play release.
3. Download `google-services.json`, reference it with `android.googleServicesFile`, and follow the deployment policy for storing it.
4. Upload the private FCM v1 service-account credential through EAS credentials. Never commit the service-account JSON.
5. Build an EAS development or production build. Remote Android push is unavailable in Expo Go on SDK 54.
6. Enable push in Notification Settings and verify the `social` and `account` Android channels.

## Before external beta

- Add Firebase Crashlytics through an SDK-54-compatible development build.
- Never attach usernames, emails, post text, chapter titles, or reading history to crash reports.
- Update the Privacy Policy and Play Data Safety answers with the exact Firebase behavior before enabling it.

## After the deployed API supports attestation

- Add Firebase App Check backed by Play Integrity.
- Begin in monitoring mode, then enforce gradually after every build profile produces valid tokens.
- Keep quest progress server-authoritative; analytics and integrity telemetry never award rewards directly.

## Optional, consent-based services

- Firebase Analytics remains off until an explicit consent and deletion/retention design exists.
- Remote Config is optional for feature flags and emergency kill switches.
- Firebase Auth is intentionally not used because Mangadamia owns its account/session system.
- Firebase Storage is unnecessary while avatars and frames are curated assets.
- Ads are not part of the launch stack.
