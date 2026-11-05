import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, type PhoneCountry } from "./phone-countries";

/**
 * Phone numbers are kept in international format with no spaces, e.g. "+2348031234567": the
 * country's calling code, then the number without the leading 0 people dial at home.
 */

const BY_DIAL = new Map(PHONE_COUNTRIES.map((entry) => [entry.dial, entry]));

const digitsOf = (text: string) => text.replace(/\D/g, "");

/** Calling codes are one to three digits and none is the start of another, so the first hit is right. */
function countryOf(digits: string): PhoneCountry | null {
  for (const length of [3, 2, 1]) {
    const match = BY_DIAL.get(digits.slice(0, length));
    if (match) return match;
  }
  return null;
}

/** "+2348031234567" from a country and what was typed after it; "" while there are no digits. */
export function joinPhone(country: PhoneCountry, national: string): string {
  const digits = digitsOf(national).replace(/^0+/, "");
  return digits ? `+${country.dial}${digits}` : "";
}

/**
 * Any way of writing a number, in international format. A number with no country code is taken
 * as Nigerian, the way it is written at home ("0803 123 4567"); older profiles hold those.
 */
export function normalisePhone(raw: string): string {
  const text = raw.trim();
  const digits = digitsOf(text);
  if (!digits) return "";
  if (text.startsWith("+")) return `+${digits}`;
  if (text.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith(DEFAULT_PHONE_COUNTRY.dial) && digits.length >= 12) return `+${digits}`;
  return joinPhone(DEFAULT_PHONE_COUNTRY, digits);
}

/** The country and the rest of the number; `country` is null when the calling code isn't in the list. */
export function splitPhone(value: string): { country: PhoneCountry | null; national: string } {
  const digits = normalisePhone(value).slice(1);
  const country = countryOf(digits);
  return country ? { country, national: digits.slice(country.dial.length) } : { country: null, national: digitsOf(value) };
}

/** "8031234567" as "803 123 4567", for reading; shorter or longer numbers are grouped the same way. */
export function formatNational(digits: string): string {
  const groups = /^(\d{1,3})(\d{1,3})?(\d+)?$/.exec(digitsOf(digits));
  return groups ? groups.slice(1).filter(Boolean).join(" ") : "";
}

/** A calling code and 7 to 14 more digits: the most international format allows is 15 in all. */
export function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
