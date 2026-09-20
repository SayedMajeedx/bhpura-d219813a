export interface PasswordEvaluation {
  score: number; // 0 to 4
  strengthKey: "weak" | "fair" | "good" | "strong";
  isValid: boolean;
  checks: {
    minLength: boolean;
    hasLetter: boolean;
    hasNumberOrSymbol: boolean;
    matches: boolean;
  };
}

export function evaluatePasswordStrength(
  password: string,
  confirmPassword?: string,
): PasswordEvaluation {
  const p = password || "";
  const minLength = p.length >= 8;
  const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(p);
  const hasNumberOrSymbol = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p);
  const matches =
    typeof confirmPassword === "string" && confirmPassword.length > 0 && p === confirmPassword;

  let score = 0;
  if (minLength) score++;
  if (hasLetter) score++;
  if (hasNumberOrSymbol) score++;
  if (p.length >= 10 && hasLetter && hasNumberOrSymbol) score++;

  let strengthKey: "weak" | "fair" | "good" | "strong" = "weak";
  if (score >= 4) strengthKey = "strong";
  else if (score === 3) strengthKey = "good";
  else if (score === 2) strengthKey = "fair";
  else strengthKey = "weak";

  const isValid = minLength && hasLetter && hasNumberOrSymbol && matches;

  return {
    score,
    strengthKey,
    isValid,
    checks: {
      minLength,
      hasLetter,
      hasNumberOrSymbol,
      matches,
    },
  };
}

/**
 * Generates an 11-character high-entropy temporary password that is easy for humans to read.
 * Format: Boutq#X9kM2
 */
export function generateSecureTempPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%&*";

  let result = "Bq-";
  // Add 3 random letters
  for (let i = 0; i < 3; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  // Add 1 symbol
  result += symbols.charAt(Math.floor(Math.random() * symbols.length));
  // Add 2 random numbers
  for (let i = 0; i < 2; i++) {
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  // Add 2 more letters
  for (let i = 0; i < 2; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

export interface TeamInviteMessageOptions {
  name?: string | null;
  storeName?: string | null;
  email: string;
  tempPassword?: string;
  loginUrl: string;
  lang: "ar" | "en";
}

export function formatTeamInviteMessage({
  name,
  storeName,
  email,
  tempPassword,
  loginUrl,
  lang,
}: TeamInviteMessageOptions): string {
  const isAr = lang === "ar";
  const brandName = storeName?.trim() || (isAr ? "متجرنا" : "Our Store");
  const memberName = name?.trim() || (isAr ? "عضو الفريق" : "Team Member");

  if (isAr) {
    return [
      `مرحباً ${memberName} 👋`,
      `تمت إضافتك رسمياً إلى فريق عمل متجر *${brandName}* على منصة Boutq OS!`,
      "",
      "🔑 *بيانات تسجيل الدخول المؤقتة:*",
      `• البريد الإلكتروني: ${email}`,
      tempPassword ? `• كلمة المرور المؤقتة: ${tempPassword}` : "",
      `• رابط تسجيل الدخول: ${loginUrl}`,
      "",
      "🛡️ *ملاحظة هامة للأمان:*",
      "ستظهر لك شاشة مخصصة فور أول تسجيل دخول لإلزام تعيين كلمة مرور جديدة خاصة بك قبل الانتقال إلى لوحة التحكم.",
      "",
      "نتمنى لك تجربة عمل موفقة وسلسة! 🚀",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Hello ${memberName} 👋`,
    `You have been added to the *${brandName}* team on Boutq OS!`,
    "",
    "🔑 *Your Temporary Login Credentials:*",
    `• Email: ${email}`,
    tempPassword ? `• Temporary Password: ${tempPassword}` : "",
    `• Sign-in Link: ${loginUrl}`,
    "",
    "🛡️ *Security Notice:*",
    "You will be prompted to set a new, private password upon your first sign-in before accessing the dashboard.",
    "",
    "Welcome aboard! 🚀",
  ]
    .filter(Boolean)
    .join("\n");
}
