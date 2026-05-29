import { isRecord } from "./internal";
import type { ApiError } from "./types";

function getMessage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeApiError(payload: unknown): ApiError | null {
  if (!isRecord(payload)) {
    return null;
  }

  const message =
    getMessage(payload.error) ??
    getMessage(payload.message) ??
    (Object.prototype.hasOwnProperty.call(payload, "errors")
      ? "Validation failed. Please check the request payload."
      : null);

  if (!message) {
    return null;
  }

  // Spread preserves extra keys the API may add in the future (e.g. `hint`, `docs`).
  return {
    ...payload,
    message,
    error: getMessage(payload.error) ?? message,
    code: getMessage(payload.code) ?? "unknown",
    request_id: getMessage(payload.request_id) ?? "unknown",
  };
}

export class PawPlacerApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status?: number;
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "PawPlacerApiError";
    this.code = apiError.code;
    this.requestId = apiError.request_id;
    this.status = apiError.status;
    this.apiError = apiError;
  }
}

export function throwApiError(apiError: ApiError): never {
  throw new PawPlacerApiError(apiError);
}

export function throwIfApiError(payload: unknown): void {
  const apiError = normalizeApiError(payload);
  if (apiError) {
    throwApiError(apiError);
  }
}

export class PawPlacerResponseValidationError extends Error {
  readonly payload: unknown;

  constructor(message: string, payload: unknown) {
    super(message);
    this.name = "PawPlacerResponseValidationError";
    this.payload = payload;
  }
}
