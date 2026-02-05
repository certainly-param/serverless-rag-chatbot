import { describe, it, expect } from "vitest";
import { withSpan } from "./observability";

describe("withSpan", () => {
  it("returns the result of the async function", async () => {
    const result = await withSpan("test", undefined, async () => 42);
    expect(result).toBe(42);
  });

  it("propagates errors", async () => {
    await expect(
      withSpan("test", undefined, async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow("fail");
  });

  it("runs without attributes", async () => {
    const out = await withSpan("no-attrs", undefined, async () => "ok");
    expect(out).toBe("ok");
  });
});
