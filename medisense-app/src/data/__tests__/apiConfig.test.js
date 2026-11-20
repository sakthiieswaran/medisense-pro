import { describe, it, expect } from "vitest";
import { resolveApiBase } from "../../apiStorage.js";

describe("Frontend API base resolution", () => {
  it("defaults to http://localhost:4000 only in non-production builds", () => {
    expect(resolveApiBase({ PROD: false, VITE_API_URL: "" }, undefined, "http://localhost:4000")).toBe(
      "http://localhost:4000"
    );
  });

  it("never falls back to localhost when PROD is true", () => {
    expect(resolveApiBase({ PROD: true, VITE_API_URL: "" }, undefined, "http://localhost:4000")).toBe("");
  });

  it("normalizes trailing slashes from VITE_API_URL", () => {
    expect(
      resolveApiBase({ PROD: true, VITE_API_URL: "https://api.medisense.example.com///" }, undefined, "")
    ).toBe("https://api.medisense.example.com");
  });

  it("supports VITE_API_BASE_URL as an alias when VITE_API_URL is unset", () => {
    expect(
      resolveApiBase({ PROD: true, VITE_API_BASE_URL: "https://api-base.medisense.example.com//" }, undefined, "")
    ).toBe("https://api-base.medisense.example.com");
  });

  it("prefers explicit runtime window override when provided", () => {
    expect(
      resolveApiBase(
        { PROD: true, VITE_API_URL: "https://api.default.com" },
        { __MEDISENSE_API_BASE__: "https://override.example.com/" },
        ""
      )
    ).toBe("https://override.example.com");
  });
});
