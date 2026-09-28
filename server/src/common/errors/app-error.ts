export interface FieldError {
  field?: string;
  message: string;
}

/** Base class for every expected, client-facing error. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(errors: FieldError[]) {
    super(400, "Validation failed", errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not authorized for this region or role") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

export class UnprovenDataError extends AppError {
  constructor() {
    super(422, "Write rejected: missing or invalid dataType/sourceId");
  }
}
