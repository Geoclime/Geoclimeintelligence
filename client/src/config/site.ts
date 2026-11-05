/**
 * The organisation's public details, shown on the About, Contact, Accessibility, Privacy and Terms
 * pages and in the footer. Kept in one place so they change together.
 *
 * PLACEHOLDERS: the email addresses, phone number and office address below are stand-ins until
 * the organisation's real details are confirmed. Replace them here before a public launch; no
 * other file needs to change.
 */
export const SITE = {
  name: "GeoClime Intelligence",
  tagline: "Climate intelligence and disaster management for Nigeria",
  contact: {
    general: "info@geoclimeintelligence.com",
    data: "data@geoclimeintelligence.com",
    support: "support@geoclimeintelligence.com",
    privacy: "privacy@geoclimeintelligence.com",
    accessibility: "accessibility@geoclimeintelligence.com",
    phone: "+234 700 000 0000",
    hours: "Monday to Friday, 9:00 to 17:00 West Africa Time",
    address: ["GeoClime Intelligence", "Central Business District", "Abuja, Federal Capital Territory", "Nigeria"],
  },
  /** Nigeria's free national emergency number. */
  emergencyNumber: "112",
  /** When the Privacy, Terms and Accessibility pages were last reviewed ("YYYY-MM-DD"). */
  policiesUpdated: "2026-10-30",
  /** Working days within which a message is answered. */
  responseDays: 5,
} as const;

/** "+234 700 000 0000" -> "tel:+2347000000000". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
