import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toApiError } from "../transport/api-error";

/**
 * Puts a failed submit's errors on the form: each backend field error (a 400's `errors[]`)
 * next to the input with the same name, and anything else as a form-level ("root") message.
 * Works because every Zod form schema uses the backend DTO's field names (standard section 11).
 */
export function applySubmitError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldNames: readonly Path<T>[],
): void {
  const apiError = toApiError(error);
  let placedOnField = false;

  for (const fieldError of apiError.fieldErrors) {
    const field = fieldNames.find((name) => name === fieldError.field);
    if (field) {
      setError(field, { type: "server", message: fieldError.message });
      placedOnField = true;
    }
  }

  if (!placedOnField) {
    const unmatched = apiError.fieldErrors.map((fieldError) => fieldError.message).join(" ");
    setError("root.server" as Path<T>, { type: "server", message: unmatched || apiError.message });
  }
}
