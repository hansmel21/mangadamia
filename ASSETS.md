# INKLIGHT — Asset checklist (phase 3)

Everything the app needs from you (or your artist). Everything NOT on this
list is already handled in code — UI icons (Lucide), fonts (Bricolage
Grotesque via Google Fonts), and the current code-drawn badge medallions,
which keep working until their art replacements land.

Palette reference: Print Black `#0D0F14` · Panel `#171A21` · Ultraviolet
`#7C5CFF` · Foil `#F5B84C` · Paper `#ECEDF2`.

---

## 1. App icon — replaces `app/assets/icon.png`
- [ ] **iOS icon** — 1024×1024 PNG, **no transparency**, square (iOS rounds it).
  Direction from the doc: Print Black ground, Ultraviolet speech-bubble glyph
  with a bookmark tail.
- [ ] **Android adaptive foreground** — 1024×1024 PNG w/ transparency; keep the
  glyph inside the middle ~66% (Android crops to a circle/squircle).
  → `app/assets/android-icon-foreground.png`
- [ ] **Android adaptive background** — 1024×1024 flat color/texture PNG
  (Print Black). → `app/assets/android-icon-background.png`
- [ ] **Android monochrome** — 1024×1024 white-on-transparent silhouette of the
  glyph (for themed icons). → `app/assets/android-icon-monochrome.png`

## 2. Splash screen
- [ ] **Splash icon** — 1024×1024 PNG w/ transparency: the glyph (or glyph +
  wordmark stacked), shown centered on a Print Black background while the app
  loads. → `app/assets/splash-icon.png` (I'll wire it into app.json when it exists)

## 3. Wordmark
- [ ] **"MangaShelf" wordmark** — SVG preferred (PNG 2048px wide ok).
  Used on the splash, the sign-in screen header, and any future about/marketing.
  Direction: Bricolage Grotesque ExtraBold or hand-lettered in that spirit,
  Paper white + one Ultraviolet accent (e.g. the bookmark tail on a letter).

## 4. Badge artwork — 14 pieces (replaces the code-drawn medallions)
Format: **SVG preferred** (or 512×512 PNG w/ transparency), one per badge id.
Each = circular medallion, mark centered, material treatment per tier:
- **Ink** = grey linework on Panel · **Tone** = silver + halftone dots ·
- **Foil** = gold `#F5B84C` on dark amber `#1D1608` · **Ultra** = violet glow + sparkle on `#15112A`

| # | File name (badge id) | Mark | Series allusion | Tier |
|---|---|---|---|---|
| 1 | `first-comment` | reader's phone | Omniscient Reader | Ink |
| 2 | `commenter-10` | swirl | Naruto | Tone |
| 3 | `commenter-50` | released katana | Bleach | Foil |
| 4 | `commenter-100` | domain gate (diamond + circle) | Jujutsu Kaisen | Ultra |
| 5 | `liked-10` | gacha capsule | Pick Me Up | Ink |
| 6 | `liked-50` | hero shield w/ S | One-Punch Man | Foil |
| 7 | `liked-100` | scouter | Dragon Ball Z | Ultra |
| 8 | `reader-10` | checkered haori pattern | Demon Slayer | Ink |
| 9 | `reader-100` | scroll | Tales of Demons and Gods | Tone |
| 10 | `reader-500` | boxing glove | Hajime no Ippo | Foil |
| 11 | `reader-1000` | monarch's crown | Solo Leveling | Ultra |
| 12 | `member-1m` | ship's anchor | One Piece | Ink |
| 13 | `member-6m` | license card | Hunter × Hunter | Foil |
| 14 | `member-1y` | hourglass | Frieren | Ultra |

Rules: allusion only — original shapes, no traced/official art, no logos.
Must stay readable at 16px (comments) and shine at ~104px (detail modal).

## 5. Empty-state spot illustrations — 4 pieces (optional but high-impact)
Halftone/ink style, mostly Tone-grey with one Ultraviolet accent,
~600×400, PNG w/ transparency or SVG:
- [ ] Browse / no search results
- [ ] Library empty
- [ ] History empty
- [ ] Comments empty ("be the first")

## 6. Nice-to-have (whenever)
- [ ] Mascot character (usable in empty states, onboarding, error screens)
- [ ] Android notification small icon (24×24-style white silhouette) — needed
  when push notifications arrive with the standalone build

---

**Hand-off:** drop files in `app/assets/` (badges under `app/assets/badges/`)
and say the word — wiring them in is a small code pass on my side.
