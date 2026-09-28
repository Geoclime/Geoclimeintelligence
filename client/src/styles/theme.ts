/**
 * Brand tokens for code that can't read CSS variables, such as Mapbox paint expressions
 * (standard section 10) or a canvas. Everything rendered with CSS uses the custom properties in
 * globals.css instead. The two must agree: teal #0E6B6F and deep teal #063C3E are the same
 * brand colours as the email standard.
 */
export const brand = {
  teal: "#0E6B6F",
  tealDeep: "#063C3E",
  tealBright: "#3FB5B9",
} as const;
