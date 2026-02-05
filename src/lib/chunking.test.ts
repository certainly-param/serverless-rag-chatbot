import { describe, it, expect } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText", () => {
  it("returns empty array for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns single chunk when text is shorter than chunkSize", () => {
    const text = "Hello world";
    expect(chunkText(text, { chunkSize: 100 })).toEqual(["Hello world"]);
  });

  it("splits text into chunks with default size and overlap", () => {
    const text = "a".repeat(1000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 900)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });

  it("uses custom chunkSize and overlap", () => {
    const text = "word ".repeat(100);
    const chunks = chunkText(text, { chunkSize: 50, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => {
      expect(c.length).toBeLessThanOrEqual(50 + 10);
    });
  });

  it("normalizes whitespace", () => {
    const text = "foo   bar\n\tbaz";
    expect(chunkText(text, { chunkSize: 100 })).toEqual(["foo bar baz"]);
  });

  it("throws when overlap >= chunkSize", () => {
    expect(() => chunkText("hello", { chunkSize: 10, overlap: 10 })).toThrow(
      "overlap must be < chunkSize"
    );
    expect(() => chunkText("hello", { chunkSize: 5, overlap: 6 })).toThrow(
      "overlap must be < chunkSize"
    );
  });

  it("returns single chunk when chunkSize <= 0", () => {
    expect(chunkText("hello", { chunkSize: 0 })).toEqual(["hello"]);
  });
});
