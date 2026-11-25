# Store listing drafts

One Markdown file per Google Play listing language: `en.md` (English source) plus `es.md`,
`pt-BR.md`, `fr.md`, `de.md`, `it.md`, `ru.md`, `tr.md`, `id.md`, `ar.md`, `hi.md`, `ja.md`,
`ko.md` (spec §16, §23).

## Format

Each file has:

1. A **draft banner** (blockquote) stating that the text is a draft needing review.
2. `# Pourly: Google Play store listing, <Language> (<tag>)`.
3. `## Title (n/30 characters)`: keeps "Pourly" and localizes the keyword part. The English title
   is exactly `Pourly: Water Sort Puzzle` (25 characters).
4. `## Short description (n/80 characters)`.
5. `## Full description (n/4000 characters)`: plain text; Play allows simple line breaks and
   bullet characters, no HTML or Markdown formatting.
6. `## Keyword suggestions`: search terms to weave into the texts (Play has no keyword field).

Counts are Unicode code points, which is what the Play Console counts. Recount after every edit, for
example with `node -e 'console.log([...require("fs").readFileSync(0,"utf8").trim()].length)'` on the
pasted text.

Play Console language codes: `en-US`, `es-ES` (or `es-419`), `pt-BR`, `fr-FR`, `de-DE`, `it-IT`,
`ru-RU`, `tr-TR`, `id`, `ar`, `hi-IN`, `ja-JP`, `ko-KR`.

## Review requirement

The English listing is a draft written against the app's real features; the other 12 are
**machine-drafted translations**. Before publishing, every file needs:

- **Native-speaker review** of all 13 languages (spec §16): natural phrasing, store-search terms
  people actually use, correct plural and number formats, and RTL punctuation in Arabic.
- A **truthfulness check** against the current build: number of levels (300 precomputed, endless
  after), the 13 languages, ads (rewarded and interstitial; Remove Ads removes only the ads between
  levels), in-app purchases (coin packs, Remove Ads, Starter Pack, VIP weekly/monthly
  auto-renewing). Do not promise anything the build lacks ("no ads", "no internet ever needed").
- A **policy check**: no ranking claims ("#1", "best"), no competitor or other games' names, no
  keyword stuffing, no emoji-heavy or all-caps titles, no references to prices or promotions in
  the title.

## Asset checklist

| Asset                | Requirement                                                                                      | Status                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| App icon             | 512 × 512 PNG, 32-bit, ≤ 1 MB (Play applies the rounded mask)                                    | Done: `assets/play-icon-512.png` (`yarn gen:assets`)        |
| Feature graphic      | 1024 × 500 JPG or 24-bit PNG, no transparency; keep text away from edges                         | Done: `assets/feature-graphic.png` (RGB, `yarn gen:assets`) |
| Phone screenshots    | 2–8 per language, 9:16 portrait, at least 1080 × 1920 recommended (4+ for promotion eligibility) | To do                                                       |
| 7-inch tablet shots  | Optional, up to 8                                                                                | Optional                                                    |
| 10-inch tablet shots | Optional, up to 8                                                                                | Optional                                                    |
| Promo video          | Optional YouTube URL, landscape, no age restriction                                              | Optional                                                    |

Suggested screenshot set (portrait, real gameplay, with a short localized caption each): the first
level mid-pour; a colourful 12–14 colour board; the win screen with stars and confetti; the daily
calendar with a streak; the themes gallery; the shop showing VIP benefits. Screenshots must show
the real app: localize the in-app language for each set.
