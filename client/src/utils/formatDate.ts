// Rivers State is on West Africa Time (UTC+1, no daylight saving). Dates are shown in that zone
// on every device, so a responder travelling abroad reads the same date as the team in Port Harcourt.
const TIME_ZONE = "Africa/Lagos";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/** "28 Sept 2026". Returns "Not available" for missing or unparseable input, never a fake date. */
export function formatDate(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : "Not available";
}

/** "28 Sept 2026, 14:05". Same fallback rule as formatDate. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? dateTimeFormatter.format(date) : "Not available";
}
