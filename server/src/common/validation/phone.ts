import { z } from "zod";

/** A phone number in international format, "+2348031234567": a country code, then 7 to 14 more digits. */
export const INTERNATIONAL_PHONE = /^\+[1-9]\d{7,14}$/;

/**
 * An optional phone number for a form that sends one with its country code (the web app's phone field
 * does). Spaces, brackets and dashes are dropped first. A blank value is allowed and means "none": a
 * create ignores it and an update clears the old number.
 */
export const optionalPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => value === "" || INTERNATIONAL_PHONE.test(value), "Enter the full number with its country code, e.g. +234 803 123 4567");
