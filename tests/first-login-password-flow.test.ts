import { describe, expect, it } from "vitest";
import {
  evaluatePasswordStrength,
  generateSecureTempPassword,
  formatTeamInviteMessage,
} from "../src/lib/team-credentials-utils";

describe("evaluatePasswordStrength", () => {
  it("evaluates empty or very short password as score 0 and strengthKey weak", () => {
    const res = evaluatePasswordStrength("", "");
    expect(res.score).toBe(0);
    expect(res.strengthKey).toBe("weak");
    expect(res.checks.minLength).toBe(false);
    expect(res.checks.matches).toBe(false);
  });

  it("checks min length requirement (8 chars)", () => {
    const short = evaluatePasswordStrength("Abc12!", "Abc12!");
    expect(short.checks.minLength).toBe(false);

    const validLen = evaluatePasswordStrength("Abcdefgh", "Abcdefgh");
    expect(validLen.checks.minLength).toBe(true);
  });

  it("identifies letters, numbers, and symbols", () => {
    const onlyLetters = evaluatePasswordStrength("abcdefgh", "abcdefgh");
    expect(onlyLetters.checks.hasLetter).toBe(true);
    expect(onlyLetters.checks.hasNumberOrSymbol).toBe(false);

    const withNumbers = evaluatePasswordStrength("abcdefgh123", "abcdefgh123");
    expect(withNumbers.checks.hasLetter).toBe(true);
    expect(withNumbers.checks.hasNumberOrSymbol).toBe(true);

    const withSymbols = evaluatePasswordStrength("abcdefgh!@#", "abcdefgh!@#");
    expect(withSymbols.checks.hasNumberOrSymbol).toBe(true);
  });

  it("identifies confirm password match and validity", () => {
    const mismatch = evaluatePasswordStrength("SuperSecret123!", "DifferentSecret123!");
    expect(mismatch.checks.matches).toBe(false);
    expect(mismatch.isValid).toBe(false);

    const match = evaluatePasswordStrength("SuperSecret123!", "SuperSecret123!");
    expect(match.checks.matches).toBe(true);
    expect(match.isValid).toBe(true);
    expect(match.strengthKey).toBe("strong");
    expect(match.score).toBe(4);
  });
});

describe("generateSecureTempPassword", () => {
  it("generates a password with prefix 'Bq-' and length >= 10", () => {
    const pwd = generateSecureTempPassword();
    expect(pwd.startsWith("Bq-")).toBe(true);
    expect(pwd.length).toBeGreaterThanOrEqual(10);
  });

  it("generates unique random passwords on repeated calls", () => {
    const pwd1 = generateSecureTempPassword();
    const pwd2 = generateSecureTempPassword();
    expect(pwd1).not.toBe(pwd2);
  });

  it("satisfies the minimum criteria for letters and numbers/symbols", () => {
    const pwd = generateSecureTempPassword();
    const analysis = evaluatePasswordStrength(pwd, pwd);
    expect(analysis.checks.minLength).toBe(true);
    expect(analysis.checks.hasLetter).toBe(true);
    expect(analysis.checks.hasNumberOrSymbol).toBe(true);
  });
});

describe("formatTeamInviteMessage", () => {
  it("formats Arabic invitation with store name, email, temp password, and instructions", () => {
    const msg = formatTeamInviteMessage({
      name: "أحمد علي",
      storeName: "بوتيك قمرة",
      email: "ahmed@example.com",
      tempPassword: "Bq-x7#9kM12",
      loginUrl: "https://boutq.app/auth",
      lang: "ar",
    });

    expect(msg).toContain("مرحباً أحمد علي");
    expect(msg).toContain("بوتيك قمرة");
    expect(msg).toContain("ahmed@example.com");
    expect(msg).toContain("Bq-x7#9kM12");
    expect(msg).toContain("https://boutq.app/auth");
    expect(msg).toContain(
      "ستظهر لك شاشة مخصصة فور أول تسجيل دخول لإلزام تعيين كلمة مرور جديدة خاصة بك",
    );
  });

  it("formats English invitation properly", () => {
    const msg = formatTeamInviteMessage({
      name: "Sarah Jenkins",
      storeName: "Velvet Maison",
      email: "sarah@example.com",
      tempPassword: "Bq-x7#9kM12",
      loginUrl: "https://boutq.app/auth",
      lang: "en",
    });

    expect(msg).toContain("Hello Sarah Jenkins");
    expect(msg).toContain("Velvet Maison");
    expect(msg).toContain("sarah@example.com");
    expect(msg).toContain("Bq-x7#9kM12");
    expect(msg).toContain("https://boutq.app/auth");
    expect(msg).toContain(
      "You will be prompted to set a new, private password upon your first sign-in",
    );
  });
});
