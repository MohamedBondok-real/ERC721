/** Typed API errors. Every thrown error is one of these so responses stay predictable. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource") => new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Resource not found") => new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) => new ApiError(409, "CONFLICT", message, details);
export const validationError = (details: unknown) => new ApiError(422, "VALIDATION_ERROR", "Request validation failed", details);
export const upstreamError = (message: string) => new ApiError(502, "UPSTREAM_ERROR", message);
export const serviceUnavailable = (message: string) => new ApiError(503, "SERVICE_UNAVAILABLE", message);

/**
 * Consent gate. Thrown whenever a clinician or admin tries to read patient data that has
 * not been explicitly authorized by the patient. Surfaced as 403 with a stable code so the
 * UI can explain *why* access was refused.
 */
export class ConsentRequiredError extends ApiError {
  constructor(patientId: string) {
    super(
      403,
      "CONSENT_REQUIRED",
      "This patient has not granted you access to their record, or the consent has been revoked or expired.",
      { patientId },
    );
    this.name = "ConsentRequiredError";
  }
}
