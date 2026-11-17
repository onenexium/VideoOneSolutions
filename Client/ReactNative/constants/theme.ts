/**
 * The app's colours: the website's design system (ott-web, "OTT Platform Homepage", 16 Nov 2026), so
 * the site and the app look like one product. Dark and content-first: orange for actions and
 * highlights, gold kept for promotion, white and muted grey for the text hierarchy. Every screen takes
 * its colours from here; a colour written into a screen is a bug.
 */
export const colors = {
  /** The page. */
  background: "#000000",
  /** Raised surfaces: headers, sheets, menus. */
  raised: "#111111",
  /** Cards, inputs, rows. */
  surface: "#1A1A1A",
  /** A surface a step up: selected chips, secondary buttons. */
  surfaceHigh: "#262626",
  /** Hairlines and outlines. */
  border: "#2E2E2E",
  /** Main text. */
  text: "#FEFEFD",
  /** Secondary text, hints, placeholders. */
  textMuted: "#9A9A9A",
  /** The primary accent: actions, highlights, progress. */
  accent: "#FF3A00",
  /** The accent, faint: a selected chip's fill. */
  accentSoft: "rgba(255, 58, 0, 0.3)",
  /** Text and icons on the accent. */
  onAccent: "#FEFEFD",
  /** The secondary accent: promotion, coins, notices. Used sparingly. */
  gold: "#E0A94A",
  /** Something went wrong. */
  danger: "#FF6B6B",
  /** Something went right (claimed, unlocked). */
  success: "#5BD98A",
  /** Dimming behind sheets and over video. */
  scrim: "rgba(0, 0, 0, 0.55)",
} as const;

/** The promotional gradient: the accent into gold, as on the website's promotional area. */
export const promoGradient = [colors.accent, colors.gold] as const;
