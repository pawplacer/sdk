import { vi } from "vitest";

import type { RequestManager } from "../src/request-manager";

export function createMockRequestManager() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    invalidate: vi.fn(),
    invalidateMatching: vi.fn(),
    stats: vi.fn(),
  } as unknown as RequestManager & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    invalidateMatching: ReturnType<typeof vi.fn>;
  };
}
