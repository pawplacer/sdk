import { randomUUID } from "node:crypto";

import type { CreateOptions } from "../types";

/**
 * Applies idempotency key and retry configuration to a POST request.
 * Mutates headers and requestOptions in place.
 */
export function applyPostOptions(
  headers: Record<string, string>,
  requestOptions: Record<string, unknown>,
  options?: CreateOptions,
): void {
  const idempotencyKey =
    options?.idempotencyKey === false
      ? null
      : (options?.idempotencyKey ?? randomUUID());
  const shouldRetry = options?.retry ?? Boolean(idempotencyKey);

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  if (shouldRetry && idempotencyKey) {
    requestOptions.retry = { methods: ["post"] };
  }
}
