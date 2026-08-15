import type { FamilyMember } from "../../types/calendar";

const DEFAULT_EVENT_COLOR = "#C8E6F5";
const DEFAULT_BORDER_COLOR = "#3B9BBF";

/** Normalize calendar_id from legacy string or array to string[]. */
export function normalizeCalendarIds(
  calendarId: string | string[] | undefined
): string[] {
  if (!calendarId) return [];
  return Array.isArray(calendarId) ? calendarId : [calendarId];
}

/**
 * Resolve profile IDs to an array of hex colors (profile order preserved).
 * Returns [DEFAULT_EVENT_COLOR] if no profiles or IDs not found.
 */
export function getEventProfileColors(
  profileIds: string[],
  familyMembers: FamilyMember[]
): string[] {
  if (!profileIds?.length) return [DEFAULT_EVENT_COLOR];
  const colors: string[] = [];
  const byId = new Map(familyMembers.map((m) => [m.id, m]));
  for (const id of profileIds) {
    const member = byId.get(id);
    if (member?.color) colors.push(member.color);
  }
  if (colors.length === 0) return [DEFAULT_EVENT_COLOR];
  return colors;
}

/**
 * Build SVG data URL for diagonal stripe pattern (-45deg).
 * stripes: array of hex colors, equal-width bands.
 */
function buildDiagonalPatternDataUrl(colors: string[]): string {
  const n = colors.length;
  const w = 100;
  const bandWidth = w / n;
  const rects = colors
    .map(
      (c, i) =>
        `<rect x="${i * bandWidth}" y="0" width="${bandWidth + 1}" height="200" fill="${c}"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200" viewBox="0 0 100 200">
  <defs>
    <pattern id="d" patternUnits="userSpaceOnUse" width="100" height="200" patternTransform="rotate(-45 0 0)">
      ${rects}
    </pattern>
  </defs>
  <rect width="100" height="200" fill="url(#d)"/>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface EventColorStyleResult {
  style: React.CSSProperties;
  borderColor: string;
}

/**
 * Returns style (and border color) for an event based on assigned profiles.
 * Single profile: solid backgroundColor.
 * Multiple profiles: diagonal stripe pattern via backgroundImage.
 */
export function getEventColorStyle(
  profileIds: string[],
  familyMembers: FamilyMember[]
): EventColorStyleResult {
  const colors = getEventProfileColors(profileIds, familyMembers);

  if (colors.length === 1) {
    return {
      style: { backgroundColor: colors[0] },
      borderColor: colors[0],
    };
  }

  const dataUrl = buildDiagonalPatternDataUrl(colors);
  return {
    style: {
      backgroundImage: dataUrl,
      backgroundSize: "cover",
      backgroundColor: colors[0],
    },
    borderColor: colors[0],
  };
}

export { DEFAULT_EVENT_COLOR, DEFAULT_BORDER_COLOR };
