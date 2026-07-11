# Google Play release checklist

This checklist is operational work that cannot be completed by source code
alone. Do not submit until every required item is confirmed against the final
AAB and deployed production service.

## Content and rights

- [ ] MangaDex has been contacted and the intended third-party client usage,
      attribution, traffic pattern, store distribution, and monetization model
      have been reviewed against its current rules.
- [ ] Written records supporting use of all third-party names and assets are
      retained for Play review.
- [ ] Only the MangaDex adapter is deployed.
- [ ] Discovery and feeds return only MangaDex `safe` content.
- [ ] No offline chapter-download feature or store-listing claim exists.
- [ ] Store screenshots are captured from policy-compliant sample content.
- [ ] Franchise-referencing badge names/art are replaced or legally cleared.

## Public policies and support

- [ ] `SUPPORT_EMAIL` and `DEVELOPER_LEGAL_NAME` use real verified values.
- [ ] `/legal/privacy`, `/legal/terms`, `/legal/community`, and
      `/legal/delete-account` are available over HTTPS without authentication.
- [ ] The Privacy Policy identifies the same legal entity as the Play listing.
- [ ] A copyright/takedown and moderation-appeal mailbox is monitored.
- [ ] A child-safety point of contact and response procedure are documented.
- [ ] Moderator coverage and response targets are documented and staffed.

## Data Safety declaration

Declare and verify at minimum:

- Personal info: email address and user ID/username.
- App activity: app interactions, library, reading progress, and chapters read.
- User-generated content: posts, comments, reports, and moderation records.
- Authentication information: password-derived hash and sessions.
- Diagnostics/security: IP address and request/security logs where applicable.
- Third-party processing by hosting, database, email, crash-reporting, or push
  providers actually used in production.
- MangaDex/CDN network requests and their ordinary network metadata.
- Encryption in transit, deletion support, retention, and any justified
  exceptions must match the deployed behavior and Privacy Policy.

## Play Console

- [ ] App name and branding have been cleared; existing MangaShelf listings
      have been considered to avoid confusion.
- [ ] Package `com.mangadamia.mangashelf` is confirmed available and registered
      before the first upload. It becomes permanent after publication.
- [ ] App category, target audience, IARC questionnaire, UGC, and content-access
      answers are accurate. Do not include children in the target audience.
- [ ] The account-deletion URL is the deployed `/legal/delete-account` page.
- [ ] Privacy URL is the deployed `/legal/privacy` page.
- [ ] Reusable moderator-capable review credentials and English instructions
      are supplied in App Access.
- [ ] Ads are declared absent unless an ads SDK is deliberately added later.
- [ ] If the developer account is a new personal account, complete the required
      closed test before applying for production access.

## Final Android artifact

- [ ] Configure EAS production environment variables; a production build must
      fail rather than fall back to localhost.
- [ ] Replace the remaining Expo template icon/splash artwork and create Play
      screenshots and a 1024×500 feature graphic.
- [ ] Inspect the final AAB with bundletool/Play Bundle Explorer.
- [ ] Confirm target API, 16 KB native-library compatibility, signing,
      `versionCode`, package name, and Play App Signing.
- [ ] Confirm only necessary permissions remain. In particular verify that
      overlay, legacy external-storage, system-settings, and vibration
      permissions are absent.
- [ ] Confirm Android backup cannot export session or personal databases.
- [ ] Run production API, account deletion, reporting, blocking, moderation,
      legal-page, offline/error, and regional network tests.

## Google services

Google Analytics, Ads, Firebase Auth, Crashlytics, FCM, and Play Integrity are
not general Play-publication requirements. Add only services the product uses:

- Play App Signing is required for release management.
- Play Integrity/App Check may be added for abuse prevention after backend
  verification is implemented.
- FCM is appropriate only when push notifications are implemented.
- Crashlytics is optional and must be reflected in Data Safety and Privacy.
- Analytics and Ads are intentionally omitted to minimize collected data.
