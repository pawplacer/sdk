import { isRecord } from "./internal";
import type { ApiError } from "./types";

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a PawPlacer error body (`{ error, code, request_id, ... }`).
 * Returns null when the payload doesn't look like an API error.
 */
export function normalizeApiError(payload: unknown): ApiError | null {
  if (!isRecord(payload)) {
    return null;
  }

  const message =
    nonEmptyString(payload.error) ??
    nonEmptyString(payload.message) ??
    (Object.hasOwn(payload, "errors")
      ? "Validation failed. Please check the request payload."
      : null);

  if (!message) {
    return null;
  }

  // Spread preserves extra keys the API may add (e.g. `hint`, `docs`).
  return {
    ...payload,
    message,
    error: nonEmptyString(payload.error) ?? message,
    code: nonEmptyString(payload.code) ?? "unknown",
    request_id: nonEmptyString(payload.request_id) ?? "unknown",
  };
}

/**
 * Thrown for every non-2xx response from the PawPlacer API.
 *
 * `code` and `requestId` come from the error body when the API returns one.
 * For responses without a PawPlacer error body (for example a gateway 502),
 * `code` is `http_<status>` and `requestId` falls back to the `x-request-id`
 * header, or `"unknown"`.
 */
export class PawPlacerApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  /** The normalized error body. Includes `errors`, `details`, `hint`, and `docs` when present. */
  readonly apiError: ApiError;

  constructor(
    apiError: ApiError,
    status: number,
    options?: { cause?: unknown },
  ) {
    super(apiError.message, options);
    this.name = "PawPlacerApiError";
    this.status = status;
    this.code = apiError.code;
    this.requestId = apiError.request_id;
    this.apiError = { ...apiError, status };
  }

  /** Builds an error from a raw error response body and status. */
  static from(
    body: unknown,
    status: number,
    headers?: Headers,
    cause?: unknown,
  ): PawPlacerApiError {
    const headerRequestId = headers?.get("x-request-id") ?? undefined;
    const normalized = normalizeApiError(body);
    const apiError: ApiError = normalized ?? {
      message: `PawPlacer API request failed with status ${status}`,
      error: `HTTP ${status}`,
      code: `http_${status}`,
      request_id: headerRequestId ?? "unknown",
    };
    if (apiError.request_id === "unknown" && headerRequestId) {
      apiError.request_id = headerRequestId;
    }
    return new PawPlacerApiError(apiError, status, { cause });
  }
}

/** Thrown when a 2xx response body doesn't match the shape the SDK expects. */
export class PawPlacerResponseValidationError extends Error {
  readonly payload: unknown;

  constructor(message: string, payload: unknown) {
    super(message);
    this.name = "PawPlacerResponseValidationError";
    this.payload = payload;
  }
}
