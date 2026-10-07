import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A new password with a show/hide toggle (at least 8 characters). */
export function PasswordField({
  value,
  onChange,
  isAr,
}: {
  value: string;
  onChange: (value: string) => void;
  isAr: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="password" className="text-xs font-semibold">
        {isAr ? "كلمة المرور" : "Password"} *
      </Label>
      <div className="relative" dir={isAr ? "rtl" : "ltr"}>
        <Input
          id="password"
          type={show ? "text" : "password"}
          dir={isAr ? "rtl" : "ltr"}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 text-xs rounded-xl pe-10 placeholder:text-muted-foreground placeholder:font-normal bg-background font-mono",
            isAr ? "text-end" : "text-start",
          )}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 z-10 transition-colors"
          tabIndex={-1}
          aria-label={
            show
              ? isAr
                ? "إخفاء كلمة المرور"
                : "Hide password"
              : isAr
                ? "إظهار كلمة المرور"
                : "Show password"
          }
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
