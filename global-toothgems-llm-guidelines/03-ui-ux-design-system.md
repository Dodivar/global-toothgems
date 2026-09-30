---
name: global-toothgems-ui-ux
description: Visual identity, responsive UX, accessibility and component design rules for Global Toothgems.
---

# UI/UX & Design System

## Brand feeling

The interface must communicate:
- premium;
- trustworthy;
- friendly;
- modern;
- expert;
- slightly playful.

It should feel like a premium beauty/lifestyle brand with strong digital-product quality.

## Palette

Core:
- White: #FFFFFF
- Black / near-black: use a restrained dark neutral
- Pastel blue: RGB(185, 205, 229) / #B9CDE5

Accent direction:
- vivid pale emerald/green for primary CTAs;
- fuchsia pink for selected secondary/highlight uses.

Do not use every accent simultaneously.
Each page should have a clear visual hierarchy.

## Typography

Primary:
- Montserrat.

No script or decorative typeface is used anywhere on the site. The former
script/parfumerie face ("Parfumerie Script") was removed because it is not
legible on screen. Editorial accents are set in Montserrat (italic 400, the
`.gt-accent` class) and differ from surrounding text by style and colour only.

Never use accent styling for:
- body copy;
- legal text;
- forms;
- navigation;
- essential instructions.

## Glass effect

Use restrained glassmorphism:
- subtle translucency;
- subtle border;
- light shadow;
- limited blur;
- strong readability.

Do not create opaque “frosted plastic” interfaces everywhere.
Glass is an accent, not the entire design language.

## Card elevation

Storefront cards (products, courses, reviews, category tiles) float visibly
above the pale blue page. They use the `--shadow-card` token at rest and
`--shadow-card-hover` when hovered or focused, both tinted with the brand ink
rather than neutral grey. The admin keeps its flatter `--shadow-xs` panels.

## Components

The design system is implemented: tokens (colours, shadows, radii, widths) in
`webapp/src/index.css`, storefront primitives in `webapp/src/components/ui/`,
back-office primitives in `webapp/src/components/admin/`. Reuse and extend them;
do not hard-code colours or create a parallel component. Reusable components exist
or must exist for:
- buttons;
- inputs;
- cards;
- product cards;
- course cards;
- navigation;
- modal/dialog;
- toast/feedback;
- progress indicators;
- quiz questions;
- review blocks;
- badges/statuses.

Components must have predictable states:
- default;
- hover;
- focus;
- active;
- disabled;
- loading;
- error where applicable.

## Product UX

Product pages should prioritize:
1. product identity;
2. imagery;
3. price;
4. availability;
5. purchase CTA;
6. essential information;
7. reassurance/FAQ;
8. reviews;
9. related products.

## Training UX

Training must feel distinct from the storefront while remaining brand-consistent.

Prioritize:
- progress visibility;
- clear next action;
- distraction-free learning;
- mobile usability;
- satisfying completion feedback.

## Accessibility

Target WCAG 2.2 AA principles where practical.

Minimum:
- keyboard navigation;
- semantic HTML;
- labels for form controls;
- sufficient contrast;
- alt text;
- accessible dialogs;
- visible focus;
- reduced-motion consideration.

Never communicate important state through color alone.

## Motion

Use subtle motion:
- page transitions;
- hover feedback;
- progress;
- completion feedback.

Respect `prefers-reduced-motion`.
Avoid motion that delays checkout or learning.
