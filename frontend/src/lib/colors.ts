/**
 * Color helpers for family-member avatars and chips.
 *
 * Member colors are mostly pastels, where white initials are nearly invisible,
 * so text color is picked from the background's luminance (WCAG formula).
 */

const DARK_TEXT = "#2B3A4A";
const LIGHT_TEXT = "#FFFFFF";

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance (0 = black, 1 = white). Returns null for colors it can't parse. */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text color for text drawn on `background`. */
export function readableTextColor(background: string): string {
  const lum = relativeLuminance(background);
  if (lum === null) return LIGHT_TEXT;
  // Contrast with white is (1.05)/(L+0.05); with dark text it's (L+0.05)/(Ld+0.05).
  // Crossover for our dark text (~0.035 luminance) sits around L ≈ 0.25.
  return lum > 0.25 ? DARK_TEXT : LIGHT_TEXT;
}

/** Inline style for a round member avatar. */
export function avatarStyle(color: string): { backgroundColor: string; color: string } {
  return { backgroundColor: color, color: readableTextColor(color) };
}
