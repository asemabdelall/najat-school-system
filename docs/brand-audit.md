# Brand audit — Al-Najat Schools reference site

**Reference:** <https://alnajat-12-test.vercel.app/> (title: "12th Grade Professional Inclinations Quiz")
**Audited:** 27 Oct 2026, with headless Chromium (Playwright 1.63), plus direct downloads of the page's HTML, CSS bundle, JS bundle, and image assets.

## What was inspected (evidence)

| Resource | URL | Status |
|---|---|---|
| Document | `/` | 200 |
| Stylesheet (Tailwind build) | `/assets/index-CLtlLUO9.css` | 200 |
| Web font CSS | `fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900` | 200 |
| Font files | `fonts.gstatic.com/s/cairo/v31/…woff2` (Arabic + Latin subsets) | 200 |
| Script bundle | `/assets/index-DLbBBmrL.js` (component class names inspected) | 200 |
| Logo | `/color.png`, 202×226 RGBA PNG, `alt="مدارس النجاة"` | 200 |
| Favicon | `/vite.svg` (the default Vite icon, **not** a school asset) | 200 |

Screenshots of the reference: [`assets/reference-site-desktop.png`](assets/reference-site-desktop.png), [`assets/reference-site-mobile.png`](assets/reference-site-mobile.png).

The site is a one-screen sign-in for a career-inclination quiz. It shows the logo, a teal→emerald ribbon reading «ثانوية النجاة بنين - حولي», a heading, and a civil-ID field. The quiz screens behind it were not reachable without a valid civil ID, so their styles were taken from the class names in the JS bundle (see "Patterns" below), not from rendered pages.

## Logo

* **Asset:** `color.png`, copied unmodified to `public/brand/alnajat-logo.png` (202×226).
* **Composition:** the bilingual wordmark «مدارس النجاة / alnajat schools» on the left, and a tall calligraphic mark with a rounded, arch-like top on the right.
* **Logo colours (measured from opaque pixels):** navy **`#004d72`** (≈ 7,800 px) and green **`#8adc64`** (≈ 1,050 px). These are the identity colours.
* **Derived assets** (cropped, never redrawn or recoloured, aspect ratio preserved):
  * `public/brand/alnajat-mark.png` (75×226): the calligraphic mark alone, used in the compact mobile top bar.
  * `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png`: the mark centred on a square canvas. The reference site's own favicon is the default Vite logo, so it was not reused.
* **Usage rules applied in the app** (`src/components/layout/Logo.tsx`):
  * always rendered at its intrinsic aspect ratio (`aspect-ratio: 202/226`, `object-contain`, width auto);
  * always on a light surface; in dark mode it gets a white plate, because the navy artwork would vanish on a dark background;
  * never recoloured, stretched, cropped further, or replaced with an icon.

## Colours

| Role | Value | Evidence |
|---|---|---|
| Brand primary (logo navy) | `#004d72` | logo pixels |
| Brand accent (logo green) | `#8adc64` | logo pixels |
| Accent gradient | `teal-500 #14b8a6 → emerald-500 #10b981`; deep variant `teal-600 → emerald-600` | ribbon (`bg-gradient-to-r from-teal-500 to-emerald-500`) and primary CTA classes in the bundle |
| Page background | `slate-50 → blue-50 → emerald-50` soft gradient | `min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-emerald-50` |
| Card surface | white at 80–90% opacity + `backdrop-blur-sm` | `bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl` |
| Heading text | `slate-800 #1e293b` | computed style of `h1` |
| Body / label text | `slate-700 #334155`, `gray-500 #6b7280` | computed styles |
| Input border / focus | `gray-300` border → `teal-500` border + `teal-200` ring | input class list |
| Error | `red-50` bg, `red-300` border, `red-600` text | alert class list |

## Typography

* **Family: Cairo** (Google Fonts), weights **400, 600, 700, 900** requested by the reference.
* Every rendered element computed to `Cairo, sans-serif` (400 ×11, 700 ×7, 600 ×2).
* Hierarchy on the reference: `h1` 48px/700 in slate-800; labels 600; button text 700.
* **In the app:** Cairo is self-hosted through `@fontsource-variable/cairo` (the same family, as a variable font covering 200–1000), so no third-party font request happens at runtime. The fallback stack is `Tahoma, 'Segoe UI', system-ui`. Sizes are compacted for a data-dense tool: body 15px, tables 14px, page titles 22px, with no 48px headings.

## Shapes, motifs and patterns

* Generous radii: `rounded-xl` (12px) on controls, `rounded-2xl`/`3xl` (16–24px) on cards.
* Soft, large shadows (`shadow-xl`/`2xl`) on floating cards.
* Translucent frosted cards over a pale multi-hue gradient: the "glass" in the brief.
* Gradient ribbons (teal→emerald) carrying the school name.
* Motion: `animate-fade-in`, `scale-in`, `slide-up`, and hover `scale-105` on buttons.
* **Motif drawn from the logo:** the mark's **rounded, arch-like top** (an arched-niche silhouette). The app uses it sparingly: the sign-in brand panel, the 403/404 badges, and the `.arch` utility.

## How the identity is applied (design system)

The tokens live in `src/index.css` (CSS variables + Tailwind `@theme`) and are the only colours the components use.

| Decision | Rationale |
|---|---|
| **Navy `#004d72` is the primary action colour** (buttons, active states, avatar) | It is the logo's dominant colour and gives white text ≈ 9:1 contrast. The reference's teal-600 button gradient falls below 4.5:1 with normal-size white text. |
| **Teal→emerald gradient kept as a restrained accent**: school-name ribbon, academic-year chip, progress bars, the "accent" button variant | It preserves the reference's recognisable gesture without applying it everywhere. |
| **Logo green `#8adc64` as the active-navigation indicator** and as icon accents on the sign-in panel | Ties the navigation to the logo without using a low-contrast green for text. |
| **Glass only on navigation surfaces** (sidebar, top bar, dropdowns) | Tables, forms, and dialogs sit on solid surfaces for legibility, as the brief requires. Blur 14px, 78% opacity. |
| Canvas = soft radial blue/green gradients on slate | Derived from the reference's `slate→blue→emerald` page background. |
| Radii: controls 10px, panels 16px, dialogs/hero 24px | Kept slightly tighter than the reference's 24px cards for density. |
| Muted text `#51607a` (not slate-400/500) | Keeps the contrast of secondary text at ≥ 4.5:1 on white. |
| Status colours (success / danger / warning / info / neutral) | Always paired with an icon and a text label (`status-badges.tsx`). |

### Chart palette (validated)

Chart colours were run through the dataviz palette validator (lightness band, chroma, CVD separation, normal-vision floor, contrast):

* **Light:** absent `#dc2626`, late `#e0a00a`, excused `#0284c7`. All checks pass (worst CVD ΔE 16.9).
* **Dark** (surface `#0f1f2c`): absent `#dc2626`, late `#b98309`, excused `#2b8ad0`. All checks pass; CVD ΔE 6.4 is in the floor band, so the charts carry secondary encoding: a legend, tooltips, 1px gaps between segments, and a table view in Reports.
* The first candidates (e.g. amber `#d97706` beside red) **failed** the normal-vision floor and were re-stepped.
* Rate and counts are deliberately **two separate charts**, never one dual-axis chart.

### Light and dark themes

Both themes are implemented from the same token names (`.dark` overrides in `src/index.css`), validated separately, and toggled from the top bar. The choice persists in `localStorage` and defaults to the OS preference.

## Unverified / limitations

* No official brand guideline document was available; the colours come from the logo pixels and the reference CSS, so they are inferred, not specified.
* The reference's inner quiz pages could not be rendered (they require a real civil ID). Their styling comes from bundle class names only.
* The reference title and copy are for a different product (a career quiz). Only the visual identity was reused, not content or layout.
