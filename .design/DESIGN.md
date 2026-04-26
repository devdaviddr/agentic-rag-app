# Agentic RAG — Design System v1

A self-contained spec for the light-theme dashboard redesign. Implementer should be able to copy `globals.css` verbatim and ship.

Aesthetic anchor: **Linear meets Vercel** — calm warm-neutral surfaces, single indigo accent, generous whitespace, micro-soft shadows, fast-feeling interactions. No glassmorphism, no gradients on chrome, no decorative gradients except optionally on the empty-state hero.

---

## 1. Design principles

- **Calm by default.** Surfaces are warm off-white; the eye should rest on content, not chrome. Chrome (topbar, sidebar, borders) sits at very low contrast against the page.
- **One accent, used sparingly.** A single indigo accent marks the primary action, the active nav item, and focus rings. Secondary buttons and metadata stay neutral. Avoid rainbow status pills.
- **Generous whitespace, tight type.** Padding is bigger than it feels like it needs to be; type scale stays compact and dense. The contrast (air outside, density inside) is the look.
- **Soft, layered shadows over hard borders.** Cards and popovers float on `0 1px 2px` + `0 8px 24px` stacks rather than 1px slate borders. Borders exist but at very low alpha (`oklch(0 0 0 / 0.06)`).
- **Fast feel.** All transitions are 120–180ms ease-out. Hover states are subtle (background tint shift, not transform). No skeleton-shimmer waltzes; use a static muted placeholder.

---

## 2. Color tokens

Light theme only for v1. Values in OKLCH. Neutrals are slightly warm (a≈0.005, h≈80) — closer to paper than to slate. Pure `#fff` and `#000` are explicitly avoided.

| Token | OKLCH | Hex (approx) | Use |
|---|---|---|---|
| `--bg-app` | `oklch(0.985 0.003 80)` | `#FAFAF8` | Page background |
| `--bg-surface` | `oklch(1 0 0)` | `#FFFFFF` | Cards, sidebar, topbar (the only place near-white lives) |
| `--bg-surface-elevated` | `oklch(0.995 0.002 80)` | `#FDFDFB` | Popovers, modals, dropdowns |
| `--bg-subtle` | `oklch(0.97 0.004 80)` | `#F4F3F0` | Hover states, code blocks, inactive tabs |
| `--border-subtle` | `oklch(0.92 0.004 80)` | `#E8E6E1` | Dividers inside cards |
| `--border-default` | `oklch(0.88 0.005 80)` | `#DCDAD3` | Card outlines, input borders |
| `--border-strong` | `oklch(0.78 0.006 80)` | `#C2BFB6` | Focus-adjacent, hovered inputs |
| `--text-primary` | `oklch(0.22 0.01 80)` | `#26241F` | Body, headings (warm near-black, not `#000`) |
| `--text-secondary` | `oklch(0.42 0.008 80)` | `#5A574F` | Subheads, secondary labels |
| `--text-muted` | `oklch(0.58 0.006 80)` | `#85827A` | Timestamps, helper text, placeholders |
| `--text-inverse` | `oklch(0.985 0.003 80)` | `#FAFAF8` | Text on accent/danger fills |
| `--accent` | `oklch(0.55 0.19 270)` | `#5B5BD6` | Primary buttons, active nav, focus ring (indigo) |
| `--accent-hover` | `oklch(0.50 0.20 270)` | `#4F4FC9` | Primary button hover |
| `--accent-subtle` | `oklch(0.96 0.03 270)` | `#EDEDFA` | Active nav background, accent badges |
| `--accent-foreground` | `oklch(0.985 0.003 80)` | `#FAFAF8` | Text on `--accent` fills |
| `--success` | `oklch(0.62 0.14 155)` | `#3FA46A` | Indexed/ready status |
| `--success-subtle` | `oklch(0.95 0.04 155)` | `#E5F4EB` | Success badge bg |
| `--warning` | `oklch(0.72 0.15 75)` | `#D69845` | Processing, pending |
| `--warning-subtle` | `oklch(0.96 0.05 75)` | `#FAF0DC` | Warning badge bg |
| `--danger` | `oklch(0.58 0.20 25)` | `#D14545` | Delete, error |
| `--danger-subtle` | `oklch(0.96 0.04 25)` | `#FBE8E5` | Danger badge bg |
| `--ring` | `oklch(0.55 0.19 270 / 0.35)` | — | Focus ring (3px) |

**Justification for indigo over blue/violet:** indigo (h≈270) reads modern and "AI-native" without veering into cliché ChatGPT teal or Anthropic clay. It pairs cleanly with warm neutrals (cool accent on warm canvas = the Linear/Resend signature).

---

## 3. Typography

**Font stack:** Inter via `next/font/google` with `display: swap`, plus `'JetBrains Mono'` for code/IDs. System fallback chain for instant first paint.

```ts
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google'
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
```

**Size scale** (compact — intentionally one notch tighter than Tailwind defaults):

| Token | px | line-height | Use |
|---|---|---|---|
| `text-xs` | 12 | 16 | Badges, timestamps, table meta |
| `text-sm` | 13 | 20 | Body default, nav items, inputs |
| `text-base` | 14 | 22 | Chat messages, card body |
| `text-md` | 15 | 24 | Emphasized body |
| `text-lg` | 17 | 26 | Card titles, section headers |
| `text-xl` | 20 | 28 | Page titles |
| `text-2xl` | 24 | 32 | Document viewer title |
| `text-3xl` | 30 | 38 | Empty-state hero only |

**Weights:** 400 (body), 500 (UI labels, nav), 600 (headings, button text), 700 (rare — emphasis only).
**Letter-spacing:** `-0.01em` on `text-lg` and above; `0` elsewhere. No uppercase tracking unless on a `text-xs` overline.

---

## 4. Spacing & radius

Tailwind's default 4px-step spacing scale is fine — keep it. Most padding lives in `2 / 3 / 4 / 6 / 8` (8 / 12 / 16 / 24 / 32 px).

**Radius scale** (override Tailwind's defaults — slightly larger):

| Token | px | Use |
|---|---|---|
| `rounded-sm` | 4 | Badges (small) |
| `rounded-md` | 8 | Inputs, small buttons |
| `rounded-lg` | 10 | Buttons, nav items, source rows |
| `rounded-xl` | 14 | Cards, dropzone, message bubbles |
| `rounded-2xl` | 18 | Modal/popover, document viewer card |
| `rounded-full` | 9999 | Avatars, pill badges, icon buttons |

Pick `rounded-xl` (14px) as the default card radius — the v1 sweet spot between Vercel's 8 and Linear's 12.

---

## 5. Shadow scale

Tailwind's defaults are too gray and too vertical. Replace with layered, warm-tinted, low-alpha stacks. All shadows use a single hue (the warm neutral) and combine a tight contact shadow with a longer ambient one.

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px 0 oklch(0 0 0 / 0.04)` | Buttons, inputs at rest |
| `shadow-sm` | `0 1px 2px 0 oklch(0 0 0 / 0.04), 0 2px 4px -1px oklch(0 0 0 / 0.04)` | Cards |
| `shadow-md` | `0 4px 8px -2px oklch(0 0 0 / 0.06), 0 2px 4px -2px oklch(0 0 0 / 0.04)` | Hovered cards, source rows |
| `shadow-lg` | `0 12px 24px -8px oklch(0 0 0 / 0.10), 0 4px 8px -4px oklch(0 0 0 / 0.06)` | Popovers, dropdowns |
| `shadow-xl` | `0 24px 48px -12px oklch(0 0 0 / 0.14), 0 8px 16px -8px oklch(0 0 0 / 0.08)` | Modals, command palette |
| `shadow-focus` | `0 0 0 3px var(--ring)` | Focus ring (combine with border) |

---

## 6. Component patterns

### Topbar
Sticky, 56px tall, full-width, sits on `--bg-surface` with a single `--border-subtle` bottom border (no shadow). Holds: logo + product name (left), breadcrumb or page title (center-left), global search trigger (center, optional v2), user avatar + menu (right). No shadow at rest; on scroll past 4px, fade in `shadow-xs`.
```tsx
<header className="sticky top-0 z-30 h-14 bg-surface border-b border-subtle px-6 flex items-center gap-4">
```

### Sidebar (expanded)
240px wide, full-height, `--bg-surface`, right border `--border-subtle`. Sections stacked with 24px vertical gaps. Section headers are `text-xs font-medium uppercase tracking-wide text-muted` (only place uppercase appears). Sticky.
```tsx
<aside className="w-60 shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 bg-surface border-r border-subtle px-3 py-4 overflow-y-auto">
```

### Sidebar (collapsed) — v2, out of scope for v1
Reserve 64px collapsed width. v1 ships expanded only.

### NavItem
Pill-shaped row, `rounded-lg`, `h-9 px-3`, `text-sm font-medium`, gap-2.5 between icon (16px) and label.
- **Inactive:** `text-secondary`, no background.
- **Hover:** `bg-subtle`, `text-primary`. Transition `120ms`.
- **Active:** `bg-accent-subtle`, `text-accent`, no left-bar indicator (the tinted bg is enough).
```tsx
<a className="flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm font-medium text-secondary hover:bg-subtle hover:text-primary aria-[current=page]:bg-accent-subtle aria-[current=page]:text-accent">
```

### Button
Three variants. All `h-9 px-3.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors duration-120`. Use `h-10 px-4` for primary CTAs and `h-8 px-3 text-xs` for compact toolbars.
- **Primary:** `bg-accent text-accent-foreground hover:bg-accent-hover shadow-xs`
- **Secondary:** `bg-surface text-primary border border-default hover:bg-subtle shadow-xs`
- **Ghost:** `text-secondary hover:bg-subtle hover:text-primary` (no border, no shadow)
- **Danger:** `bg-danger text-inverse hover:brightness-95 shadow-xs`
- **Disabled:** `opacity-50 pointer-events-none` (no separate gray fill — preserves layout)

### Input
`h-9 px-3 rounded-md text-sm bg-surface border border-default placeholder:text-muted shadow-xs`. On focus: `border-strong ring-3 ring-[var(--ring)] outline-none`. Textarea inherits same look with `min-h-24 py-2`.
```tsx
<input className="h-9 w-full rounded-md border border-default bg-surface px-3 text-sm placeholder:text-muted shadow-xs focus:border-strong focus:outline-none focus:ring-3 focus:ring-[var(--ring)]" />
```

### Card / Surface
The workhorse. `bg-surface rounded-xl border border-subtle shadow-sm p-5` (or `p-6` for primary content). Hovered (clickable card variant): `shadow-md border-default transition-shadow duration-150`. Avoid stacking cards inside cards — use `--border-subtle` dividers instead.

### Badge
`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium`. Status flavors:
- **Default:** `bg-subtle text-secondary`
- **Success (Indexed):** `bg-[--success-subtle] text-[--success]`
- **Warning (Processing):** `bg-[--warning-subtle] text-[--warning]` + 1.5px pulsing dot
- **Danger (Failed):** `bg-[--danger-subtle] text-[--danger]`
- **Accent:** `bg-accent-subtle text-accent`

### Empty state
Centered column, `max-w-sm mx-auto py-16 text-center`. Stack: 40px monoline icon (text-muted), `text-lg font-semibold text-primary` headline, `text-sm text-secondary` body, primary button. No illustration in v1 — keep it editorial.

### Toast / inline status
Toasts: bottom-right, `rounded-xl bg-surface-elevated shadow-lg border border-subtle p-4 max-w-sm`, with a 3px left accent bar tinted by status. Auto-dismiss 4s. Use sparingly — prefer inline status for upload progress.
Inline status: a 24px-tall row under the affected item, `text-xs text-secondary` with a leading status dot (8px, status color). For upload: a thin 2px progress bar in `--accent` along the bottom edge of the source row.

### Chat message bubble
Conversation is a vertical scroll, max-width 720px centered. Messages stack with 24px gap.
- **User:** right-aligned, `bg-accent-subtle text-primary rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]`. No avatar.
- **Assistant:** left-aligned, no bubble fill — just `text-primary text-base leading-7` with a 24px circular accent-tinted avatar (`bg-accent-subtle text-accent`) and a `text-xs text-muted` "Assistant" label above. Streaming cursor: `▍` blinking at 1Hz, `text-accent`.
- **Citations:** inline superscript chips `[1]` styled as accent badges, click to open the source in the right rail.

### Source item (Sources panel row)
`flex items-center gap-3 p-3 rounded-lg hover:bg-subtle transition-colors`. Layout: file-type icon (20px, monoline, text-muted) → title (`text-sm font-medium text-primary truncate`) → metadata row (`text-xs text-muted`: chunk count · upload date) → status badge → kebab menu (ghost icon button, visible on row hover only). Clicking opens the document viewer.

### Upload dropzone
`rounded-xl border-2 border-dashed border-default bg-subtle/50 p-10 text-center transition-colors`. Drag-active: `border-accent bg-accent-subtle`. Inside: 32px upload icon (text-muted, becomes text-accent on drag), `text-sm font-medium` headline ("Drop files or click to browse"), `text-xs text-muted` constraint line ("txt, md, pdf · up to 20MB"). Click target spans the full dropzone.

---

## 7. Layout

| Region | Spec |
|---|---|
| Topbar | 56px tall, sticky `top-0 z-30`, full-width |
| Sidebar | 240px wide, sticky `top-14`, full-height minus topbar, scrollable on overflow |
| Content area | `flex-1 min-w-0`, scrollable |
| Page max-width | `max-w-6xl` (1152px) for dashboard pages; chat constrains to `max-w-3xl` (768px); document viewer to `max-w-4xl` (896px) |
| Page gutter | `px-6` (24px) on mobile/tablet, `px-8` (32px) on `lg+` |
| Section gap | `space-y-8` (32px) between major sections; `space-y-4` within a section |

**Sticky vs scrollable:** Topbar and sidebar are sticky; content scrolls. Within the chat surface, the message list scrolls and the composer is sticky at the bottom of the content area (not the viewport — it stays inside the content column). Within the sources panel, the upload dropzone is sticky at top, list scrolls below.

**Mobile (< 768px) for v1:** Sidebar collapses to a hamburger in the topbar that opens an off-canvas drawer (`fixed inset-y-0 left-0 w-72 bg-surface shadow-xl`, dimmed scrim behind). Topbar stays. Content gutters drop to `px-4`. Document viewer becomes single-column (chunks below content, not a right rail). **No tablet-specific layout** — phone layout up to 768, desktop layout above.

---

## 8. Tailwind v4 wiring — `globals.css`

Tailwind v4 uses `@import "tailwindcss"` and `@theme` blocks (no `tailwind.config.js`). Tokens declared inside `@theme` become utility classes automatically (e.g. `--color-accent` → `bg-accent`, `text-accent`, `border-accent`).

Copy this file verbatim into `apps/web/src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  /* ---------- Color ---------- */
  --color-bg-app: oklch(0.985 0.003 80);
  --color-bg-surface: oklch(1 0 0);
  --color-bg-surface-elevated: oklch(0.995 0.002 80);
  --color-subtle: oklch(0.97 0.004 80);

  --color-border-subtle: oklch(0.92 0.004 80);
  --color-border-default: oklch(0.88 0.005 80);
  --color-border-strong: oklch(0.78 0.006 80);

  --color-primary: oklch(0.22 0.01 80);
  --color-secondary: oklch(0.42 0.008 80);
  --color-muted: oklch(0.58 0.006 80);
  --color-inverse: oklch(0.985 0.003 80);

  --color-accent: oklch(0.55 0.19 270);
  --color-accent-hover: oklch(0.50 0.20 270);
  --color-accent-subtle: oklch(0.96 0.03 270);
  --color-accent-foreground: oklch(0.985 0.003 80);

  --color-success: oklch(0.62 0.14 155);
  --color-success-subtle: oklch(0.95 0.04 155);
  --color-warning: oklch(0.72 0.15 75);
  --color-warning-subtle: oklch(0.96 0.05 75);
  --color-danger: oklch(0.58 0.20 25);
  --color-danger-subtle: oklch(0.96 0.04 25);

  /* ---------- Type ---------- */
  --font-sans: var(--font-sans), ui-sans-serif, system-ui, -apple-system,
               'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, 'JetBrains Mono', Menlo,
               Monaco, Consolas, monospace;

  --text-xs: 0.75rem;       /* 12 */
  --text-xs--line-height: 1rem;
  --text-sm: 0.8125rem;     /* 13 */
  --text-sm--line-height: 1.25rem;
  --text-base: 0.875rem;    /* 14 */
  --text-base--line-height: 1.375rem;
  --text-md: 0.9375rem;     /* 15 */
  --text-md--line-height: 1.5rem;
  --text-lg: 1.0625rem;     /* 17 */
  --text-lg--line-height: 1.625rem;
  --text-xl: 1.25rem;       /* 20 */
  --text-xl--line-height: 1.75rem;
  --text-2xl: 1.5rem;       /* 24 */
  --text-2xl--line-height: 2rem;
  --text-3xl: 1.875rem;     /* 30 */
  --text-3xl--line-height: 2.375rem;

  /* ---------- Radius ---------- */
  --radius-sm: 0.25rem;     /* 4  */
  --radius-md: 0.5rem;      /* 8  */
  --radius-lg: 0.625rem;    /* 10 */
  --radius-xl: 0.875rem;    /* 14 */
  --radius-2xl: 1.125rem;   /* 18 */

  /* ---------- Shadow ---------- */
  --shadow-xs: 0 1px 2px 0 oklch(0 0 0 / 0.04);
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.04),
               0 2px 4px -1px oklch(0 0 0 / 0.04);
  --shadow-md: 0 4px 8px -2px oklch(0 0 0 / 0.06),
               0 2px 4px -2px oklch(0 0 0 / 0.04);
  --shadow-lg: 0 12px 24px -8px oklch(0 0 0 / 0.10),
               0 4px 8px -4px oklch(0 0 0 / 0.06);
  --shadow-xl: 0 24px 48px -12px oklch(0 0 0 / 0.14),
               0 8px 16px -8px oklch(0 0 0 / 0.08);

  /* ---------- Misc ---------- */
  --ring-color: oklch(0.55 0.19 270 / 0.35);
  --container-content: 72rem;   /* 1152 */
  --container-chat:    48rem;   /* 768  */
  --container-doc:     56rem;   /* 896  */
}

/* ---------- Base ---------- */
:root {
  color-scheme: light;
  --ring: var(--ring-color);
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--color-bg-app);
  color: var(--color-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

::selection {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

/* Scrollbar — thin, neutral */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-default) transparent;
}
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover { background: var(--color-border-strong); background-clip: padding-box; border: 2px solid transparent; }

/* Focus-visible ring (utility for non-input focusables) */
:where(button, a, [role="button"]):focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
  border-radius: var(--radius-md);
}
```

### Generated utility classes (after the above)

The `@theme` declarations make these available automatically:
- Colors: `bg-bg-app`, `bg-surface`, `bg-subtle`, `bg-accent`, `text-primary`, `text-secondary`, `text-muted`, `text-accent`, `border-default`, `border-subtle`, `border-strong`, etc.
- Type: `text-xs` through `text-3xl` with their pinned line-heights.
- Radius: `rounded-sm` through `rounded-2xl`.
- Shadow: `shadow-xs` through `shadow-xl`.
- Container width: `max-w-content`, `max-w-chat`, `max-w-doc`.

### Layout aliases (optional, drop into `globals.css` if desired)

```css
@utility container-page {
  max-width: var(--container-content);
  margin-inline: auto;
  padding-inline: 1.5rem;        /* 24 */
  @media (min-width: 1024px) {
    padding-inline: 2rem;        /* 32 */
  }
}
```

Then `<main className="container-page">` works out of the box.

---

## Open items deferred to v2

- Dark theme (token names are theme-agnostic; add a `@theme dark { ... }` block).
- Collapsed sidebar (icon-only at 64px).
- Command palette (Cmd-K) styling — will reuse popover + input tokens.
- Code-block syntax theme for assistant responses (use a One-Light variant tuned to the warm neutrals).
