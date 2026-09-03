---
kind: frontend_style
name: Tailwind CSS Design System with Custom Brand/Ink Tokens and Dark Mode
category: frontend_style
scope:
    - '**'
source_files:
    - stepwise ai/app/tailwind.config.js
    - stepwise ai/app/app/globals.css
    - stepwise ai/app/components/ui.tsx
    - stepwise ai/app/postcss.config.js
---

## Approach

The app uses **Tailwind CSS** (v4 via PostCSS + Autoprefixer) as the sole styling engine. There is no CSS-in-JS library, SCSS, or component library — all visual styling is expressed through Tailwind utility classes plus a small set of custom design tokens and React primitives.

## Key Files

- `app/tailwind.config.js` — defines the design token system: two custom color palettes (`brand.*` blue scale and `ink.*` neutral scale), font family (`Inter` + system stack), custom shadows (`card`, `panel`), and animations (`fade-in`, `slide-up`).
- `app/app/globals.css` — global base styles, CSS custom properties for the board canvas (`--board-bg`, `--board-dot`), dark-mode body defaults, accessible focus ring, reduced-motion handling, and reusable utilities like `.board-surface`, `.band-early`, `.band-young`, `.panel-scroll`.
- `app/components/ui.tsx` — the shared UI primitive layer (`Button`, `Card`, `Input`, `Textarea`, `Select`, `Badge`, `Spinner`, `Alert`, `EmptyState`, `DemoBanner`) that encapsulates consistent spacing, typography, borders, and dark-mode variants behind typed props (`variant`, `size`, `tone`).
- `app/postcss.config.js` — enables Tailwind and Autoprefixer.

## Architecture & Conventions

1. **Design tokens over ad-hoc values.** Colors are never hard-coded hex literals in components; they reference `brand-*` and `ink-*` tokens defined in `tailwind.config.js`. This centralizes the palette and makes theming straightforward.
2. **Dark mode via class strategy.** `darkMode: "class"` in Tailwind config means the app toggles a `.dark` class on the root element. Every component in `ui.tsx` explicitly provides both light and dark variants using `dark:` prefixes (e.g. `bg-white dark:bg-ink-900`, `text-ink-700 dark:text-ink-300`).
3. **Primitive-first component model.** `ui.tsx` exposes low-level building blocks (buttons, inputs, cards, badges, alerts) rather than page-level components. Page components compose these primitives with Tailwind utilities instead of defining new style rules.
4. **Semantic tone system.** Components accept a `tone` prop (`neutral | green | amber | red | blue | purple` for Badges, `info | error | success | warning` for Alerts) mapped to predefined Tailwind class sets, ensuring consistent status coloring across the app.
5. **Accessibility baked into globals.** `globals.css` applies a visible focus ring (`outline: 3px solid theme("colors.brand.500")`) via `:focus-visible`, and disables animations when `prefers-reduced-motion: reduce` is set.
6. **Board-specific visuals via CSS variables.** The interactive board surface uses `--board-bg` and `--board-dot` CSS custom properties scoped under `:root` and `.dark`, allowing the dotted canvas background to adapt to light/dark themes without Tailwind class changes.
7. **Adaptive typography bands.** `.band-early` and `.band-young` helpers provide age-band-based font sizes for the adaptive UI feature described in the specs.
8. **No external UI kit.** The project builds its own mini design system from scratch in `ui.tsx` rather than importing shadcn, Radix, or similar libraries.

## Conventions & Constraints

- All colors must come from the `brand.*` or `ink.*` token scales (or standard Tailwind palette); arbitrary hex values inside components are avoided.
- Every interactive element should use one of the primitives from `ui.tsx` so that focus states, disabled states, and dark-mode variants stay uniform.
- Dark-mode variants are mandatory: any component using `ink-*` or `brand-*` colors must also define the corresponding `dark:` variant.
- Status feedback must combine icon + text (never color alone), as enforced by the `FEEDBACK_META` map and the comment in `ui.tsx` referencing spec doc 05.
- Animations respect user motion preferences via the `prefers-reduced-motion` block in `globals.css`.
- The content scan path `./app/**/*.{ts,tsx}, ./components/**/*.{ts,tsx}` in `tailwind.config.js` is the authoritative list of files Tailwind will purge — new pages must live under those directories to be styled.