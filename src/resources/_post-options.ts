import { randomUUID } from "node:crypto";

import type { CreateOptions } from "../types";

/**
 * Applies idempotency key and retry configuration to a write request.
 * Mutates headers and requestOptions in place.
 */
export function applyPostOptions(
  headers: Record<string, string>,
  requestOptions: Record<string, unknown>,
  options?: CreateOptions,
  method: "patch" | "post" = "post",
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
    requestOptions.retry = { methods: [method] };
  }
}
