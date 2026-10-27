import { ValidationError } from "../../../../common/errors/app-error";

/** A 400 about the uploaded file as a whole, shown on the import screen's file input. */
export function fileError(message: string): ValidationError {
  return new ValidationError([{ field: "file", message }]);
}
