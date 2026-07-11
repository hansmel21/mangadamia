export const TERMS_VERSION = "2026-07-10";

export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@your-domain.example";

export const TERMS_SECTIONS = [
  {
    title: "Using MangaShelf",
    body: "You must be at least 13 years old, meet the minimum digital-consent age in your country, and provide accurate account information. MangaShelf uses the documented MangaDex API and does not sell, host, or offer offline downloads of third-party chapters.",
  },
  {
    title: "Your content",
    body: "You keep ownership of posts and comments you create. You grant MangaShelf a limited license to store, display, moderate, and remove that content solely to operate and protect the service.",
  },
  {
    title: "Prohibited conduct",
    body: "Do not post illegal, infringing, hateful, harassing, sexually explicit, exploitative, deceptive, or privacy-invasive content. Child sexual abuse and exploitation, grooming, threats, spam, impersonation, and attempts to evade moderation are strictly prohibited.",
  },
  {
    title: "Moderation",
    body: "We may review reports, limit visibility, remove content, preserve evidence when legally required, and warn, suspend, or terminate accounts. Users can report content and users and can block other users in the app.",
  },
  {
    title: "Third-party content",
    body: "Manga titles, covers, and chapters remain the property of their respective creators and rights holders. Availability through MangaDex does not transfer ownership to MangaShelf or its users.",
  },
  {
    title: "Contact",
    body: `Questions, appeals, copyright notices, and safety concerns can be sent to ${SUPPORT_EMAIL}.`,
  },
] as const;

export const COMMUNITY_SECTIONS = [
  {
    title: "Be safe and respectful",
    body: "No harassment, bullying, hate speech, threats, doxxing, sexual solicitation, non-consensual sexual content, or encouragement of self-harm or dangerous acts.",
  },
  {
    title: "Protect children",
    body: "Never create, request, share, link to, or normalize child sexual abuse or exploitation. Suspected illegal material is removed, accounts are disabled, evidence may be preserved, and reports are made to the appropriate authorities where required.",
  },
  {
    title: "Respect intellectual property",
    body: "Do not upload copyrighted pages, piracy links, paywall bypasses, leaked chapters, or instructions for obtaining unauthorized copies.",
  },
  {
    title: "Keep discussions usable",
    body: "Mark spoilers, avoid spam and repetitive promotion, do not impersonate others, and do not manipulate likes, reports, badges, or account systems.",
  },
  {
    title: "Report problems",
    body: "Use the report control on posts, comments, and profiles. Block users when you do not want to see or receive interactions from them. Urgent child-safety concerns may also be sent to the support contact.",
  },
] as const;

export const PRIVACY_SECTIONS = [
  {
    title: "Data we collect",
    body: "Account data includes email address, username, password hash, session information, Terms acceptance, and account status. Service data includes library entries, reading progress, chapters read, posts, comments, likes, reports, blocks, notifications, and moderation records. Server security logs may contain IP address, request time, and request metadata.",
  },
  {
    title: "How we use data",
    body: "We use data to provide accounts and sync, operate community features, remember reading progress, prevent abuse, investigate reports, secure the service, comply with law, and support account and content appeals.",
  },
  {
    title: "Third parties",
    body: "Catalog and chapter requests use MangaDex and its image-delivery network. Those services receive ordinary network information such as IP address and user agent. Hosting, database, email, crash-reporting, and notification providers may process data only to provide their contracted services.",
  },
  {
    title: "Retention and deletion",
    body: "Account data is retained while the account is active. Users can delete their account in the app. Associated personal data is deleted or de-identified, except limited records retained for security, fraud prevention, legal compliance, or documented moderation needs.",
  },
  {
    title: "Security and choices",
    body: "Production traffic must use encryption in transit. Passwords are hashed. Users can delete their own posts and comments, block users, request account deletion, and contact support about access, correction, deletion, or appeals.",
  },
  {
    title: "Contact",
    body: `Privacy inquiries can be sent to ${SUPPORT_EMAIL}. The production policy must identify the legal developer entity shown in the Play Store listing.`,
  },
] as const;

export type LegalSection = { readonly title: string; readonly body: string };
