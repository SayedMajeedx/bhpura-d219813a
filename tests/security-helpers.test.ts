import { describe, expect, it } from "vitest";

import { constantTimeSecretEqual } from "../src/lib/security.server";

describe("server security helpers", () => {
  it("compares equal secrets after fixed-length hashing", async () => {
    await expect(constantTimeSecretEqual("Bearer secret", "Bearer secret")).resolves.toBe(true);
  });

  it("rejects different secrets, including different lengths", async () => {
    await expect(constantTimeSecretEqual("Bearer wrong", "Bearer secret")).resolves.toBe(false);
    await expect(constantTimeSecretEqual("", "Bearer secret")).resolves.toBe(false);
  });
});
