---
name: Vitality Core
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#e0bfba'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#a88a86'
  outline-variant: '#59413e'
  surface-tint: '#ffb4aa'
  primary: '#ffb4aa'
  on-primary: '#690003'
  primary-container: '#ff6b5c'
  on-primary-container: '#6d0004'
  inverse-primary: '#ae3027'
  secondary: '#44e2cd'
  on-secondary: '#003731'
  secondary-container: '#03c6b2'
  on-secondary-container: '#004d44'
  tertiary: '#54dcb7'
  on-tertiary: '#00382b'
  tertiary-container: '#00af8c'
  on-tertiary-container: '#003a2d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#8c1713'
  secondary-fixed: '#62fae3'
  secondary-fixed-dim: '#3cddc7'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005047'
  tertiary-fixed: '#74f9d2'
  tertiary-fixed-dim: '#54dcb7'
  on-tertiary-fixed: '#002118'
  on-tertiary-fixed-variant: '#00513f'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  surface-card: '#1E1E1E'
  surface-overlay: '#2A2A2A'
  success-green: '#4ADE80'
  warning-amber: '#FBBF24'
  error-red: '#F87171'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  margin-mobile: 20px
  margin-desktop: 40px
  gutter: 16px
  stack-sm: 4px
  stack-md: 12px
  stack-lg: 24px
---

## Brand & Style

The design system is centered on high-performance wellness, blending the precision of a data-driven tool with the warmth of a personal health coach. The target audience includes health-conscious professionals and fitness enthusiasts who value efficiency, clarity, and a premium aesthetic.

The visual style is a sophisticated **Modern Corporate-Mixed** approach. It leans heavily into a "Dark Mode First" philosophy to reduce eye strain during early morning or late-night logging, while maintaining a clean, medical-grade clarity. The interface utilizes high-contrast data visualization against deep, layered backgrounds, punctuated by vibrant, energizing accents to evoke motivation and progress.

## Colors

The palette is anchored by a deep neutral base to establish a premium "Pro" feel. 

- **Primary (Coral/Orange):** Used for primary actions, progress indicators, and caloric goals. It represents energy and metabolism.
- **Secondary (Teal):** Used for secondary metrics like protein intake, hydration, and completion states. It provides a cooling, balanced contrast to the primary coral.
- **Neutral System:** The background is near-black to ensure perfect contrast for the vibrant accents. Surface levels are defined by subtle increases in lightness rather than pure gray scales, creating a sense of depth and hierarchy.

## Typography

This design system utilizes **Inter** exclusively to ensure maximum legibility across dense data sets. 

- **Headlines:** Use tight letter spacing and heavy weights to create a strong visual anchor for page titles and large metric displays.
- **Body:** Standardized at 16px for optimal readability. Use `body-sm` for secondary metadata and nutrient breakdowns.
- **Labels:** Uppercase `label-bold` should be used for category tags and small UI headers to distinguish them from interactive body text.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. On mobile, content is contained within a 20px margin with a single-column stack. On desktop, the system uses a 12-column grid with a maximum content width of 1200px.

- **Vertical Rhythm:** Use an 8px base grid. Components should be spaced using `stack-md` (12px) for related items and `stack-lg` (24px) for distinct sections.
- **Content Grouping:** Use generous internal padding within cards (min 20px) to maintain the premium, "breathable" aesthetic despite high data density.

## Elevation & Depth

This design system uses **Tonal Layering** combined with **Ambient Shadows** to define hierarchy.

- **Base Layer:** The deepest background color (`#121212`).
- **Surface Layer:** Cards and containers sit on `#1E1E1E`. They feature a 1px subtle border (color: `white` at 5% opacity) to define edges without adding visual noise.
- **Shadows:** Use large-radius, low-opacity shadows (Blur: 30px, Y: 10px, Opacity: 30% of Black) to make active cards appear "lifted."
- **Overlays:** Modals and dropdowns use the `#2A2A2A` surface with a subtle backdrop blur (8px) on the layers beneath them to maintain context while focusing attention.

## Shapes

The shape language is friendly yet structured, using **Rounded (Level 2)** settings.

- **Standard Components:** Buttons and input fields use 0.5rem (8px) corners.
- **Cards & Containers:** Primary content containers use `rounded-lg` (16px) or `rounded-xl` (24px) to create the soft, approachable look characteristic of modern lifestyle apps.
- **Progress Bars:** These should always be fully pill-shaped (rounded-full) to emphasize the fluid nature of health and habit tracking.

## Components

- **Buttons:** Primary buttons use a solid gradient of the Primary Coral. Secondary buttons use a ghost style with the Teal accent for the border and text.
- **Cards:** The "Nutrition Card" is the core component. It features a Primary-colored progress ring for calories and smaller Teal rings for macros. Text hierarchy within cards must be strictly maintained: Large bold numbers for primary data, small regular labels for units.
- **Input Fields:** Dark-themed inputs with 1px borders that glow with the Secondary Teal color when focused. Use `body-md` for user-entered text.
- **Chips:** Small, pill-shaped tags used for food categories (e.g., "High Protein," "Vegan"). These use low-opacity versions of the accent colors for the background with high-opacity text.
- **Progress Bars:** Horizontal bars for daily limits. The background "track" should be a dark gray (`#2A2A2A`), with the "fill" being a vibrant gradient from Primary Coral to Secondary Teal to represent completion.