export const CURRENT_TERMS_VERSION = "2026-07-10";

export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@your-domain.example";

export const PROHIBITED_CONTENT = [
  "child sexual abuse or exploitation",
  "sexual or non-consensual sexual content",
  "harassment, threats, hate speech, or doxxing",
  "copyright infringement or piracy links",
  "spam, impersonation, fraud, or moderation evasion",
] as const;

const HIGH_RISK_PATTERNS = [
  /\bcsam\b/i,
  /child\s*(porn|sexual|nudes?)/i,
  /minor\s*(porn|sexual|nudes?)/i,
  /rape\s*(video|image|content)/i,
];

export function validateUserContent(body: string): void {
  if (/https?:\/\//i.test(body)) {
    throw Object.assign(
      new Error("External links are not allowed in community posts or comments"),
      { statusCode: 400 },
    );
  }
  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(body))) {
    throw Object.assign(new Error("This content violates the Community Guidelines"), {
      statusCode: 400,
    });
  }
}
