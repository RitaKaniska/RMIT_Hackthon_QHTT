---
name: embargo-frontend
description: Restyle or extend the Embargo React frontend using its dark violet reference direction. Use for Embargo landing pages, workspace screens and shared UI components.
---

# Embargo frontend

Follow the user's two visual references: Vela's spacious dark canvas and floating
workspace composition, with Customy's violet light arcs and translucent dashboard
surfaces. Keep Embargo's disclosure workflow and terminology; do not copy the
reference brands, AI product claims, partner logos or invented statistics.

## Visual decisions

- Base `#080611`, raised surface `#141020`, border `#30283f`, primary text
  `#f5f2ff`, secondary text `#b4adc5`, violet `#a48aff`.
- Use a geometric sans-serif stack, restrained medium weights and large, tightly
  spaced landing headings. Use monospace only for actual record identifiers,
  encrypted data and the small disclosure-channel label.
- Public pages: framed desktop canvas, understated brand, compact navigation,
  two-column headline and introduction, generous negative space, then a layered
  report-routing illustration. One blurred violet halo and an elliptical light
  arc are enough. Render these in CSS, not raster screenshots.
- Application pages: dark violet sidebar, faint borders, translucent raised
  panels, compact tables, lavender active states. Keep form fields and report text
  highly legible. Avoid adding landing-sized glows behind dense working forms.
- Primary buttons use a lavender-to-violet fill with a narrow highlight. Secondary
  actions use transparent surfaces and fine borders. Use pills for status and
  navigation where helpful, not for every piece of text.

## Product constraints

Preserve SDK authentication, route guards, API calls, policy inspection and error
classification. Never fabricate successful login, policy approval, encryption,
decryption or governance outcomes. A static scene must be labelled as an
illustration and must not look like actual report or live activity data.

Missing Tide configuration must still show actionable setup diagnostics. Keep
prototype limitations accessible. Render report content as escaped text.

## Implementation and review

Read `src/workspace.css`, `src/style.css`, `src/views/Landing.jsx` and the affected
view. Maintain theme decisions in `src/workspace.css`; do not stack a new theme
file over it. Reuse `DisclosureScene` for the explanatory public-page artwork.
Keep public navigation anchors connected to real sections and use the real SDK
login handler for sign-in actions.

At mobile widths, stack the hero, flatten floating artwork into normal flow, and
keep tables horizontally scrollable. Preserve visible focus, native form controls,
semantic headings and reduced-motion preferences. Run the production build and
inspect desktop/mobile screenshots when browser tooling is available. Distinguish
visual checks from live Tide integration tests in the completion report.
