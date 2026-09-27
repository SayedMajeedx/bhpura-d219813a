import { useState } from "react";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FIELD =
  "h-12 bg-background text-base shadow-none transition-[border-color,box-shadow] duration-200 hover:border-border-strong md:text-sm";

/** The email field, with its icon inside the input. */
export function EmailField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email" className="text-sm font-medium text-foreground">
        {label}
      </Label>
      <div className="group relative">
        <Mail
          className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
          aria-hidden="true"
        />
        <Input
          id="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          placeholder="partner@boutq.store"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // The field keeps the page's direction (so the icon's padding flips
          // with it), while the address itself always reads left to right.
          className={cn(FIELD, "ps-10 pe-3 [unicode-bidi:plaintext]")}
        />
      </div>
    </div>
  );
}

/**
 * The password field: show / hide toggle, and a note while Caps Lock is on
 * (the usual reason a correct password is refused).
 */
export function PasswordField({
  label,
  value,
  onChange,
  isAr,
  action,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isAr: boolean;
  /** Shown beside the label (the "forgot password" link). */
  action?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const readCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="password" className="text-sm font-medium text-foreground">
          {label}
        </Label>
        {action}
      </div>
      <div className="group relative">
        <KeyRound
          className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
          aria-hidden="true"
        />
        <Input
          id="password"
          type={visible ? "text" : "password"}
          required
          minLength={8}
          autoComplete="current-password"
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={readCapsLock}
          onKeyUp={readCapsLock}
          onBlur={() => setCapsLock(false)}
          aria-describedby={capsLock ? "password-caps" : undefined}
          className={cn(FIELD, "ps-10 pe-12")}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setVisible((v) => !v)}
          aria-label={
            visible
              ? isAr
                ? "إخفاء كلمة المرور"
                : "Hide password"
              : isAr
                ? "إظهار كلمة المرور"
                : "Show password"
          }
          aria-pressed={visible}
          className="absolute end-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {capsLock && (
        <p id="password-caps" role="status" className="auth-swap text-xs text-warning">
          {isAr ? "زر الأحرف الكبيرة (Caps Lock) مفعّل." : "Caps Lock is on."}
        </p>
      )}
    </div>
  );
}

/** English / Arabic as a two-option segmented switch. */
export function LanguageSwitch({
  lang,
  onChange,
}: {
  lang: "en" | "ar";
  onChange: (lang: "en" | "ar") => void;
}) {
  const options = [
    { value: "en", label: "EN", name: "English" },
    { value: "ar", label: "ع", name: "العربية" },
  ] as const;
  return (
    <div
      role="group"
      aria-label={lang === "ar" ? "اللغة" : "Language"}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
    >
      {options.map((option) => {
        const active = lang === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="chip"
            size="sm"
            lang={option.value}
            aria-pressed={active}
            aria-label={option.name}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-10 rounded-md font-semibold",
              active &&
                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
