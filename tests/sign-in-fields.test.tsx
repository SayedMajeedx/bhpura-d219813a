import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EmailField,
  LanguageSwitch,
  PasswordField,
} from "../src/features/auth/components/SignInFields";
import { SignInBrandPanel } from "../src/features/auth/components/SignInBrandPanel";

// The redesigned admin sign-in's fields: the password can be shown, Caps Lock
// is pointed out, the language switch reports its state, and the brand panel
// has no heading of its own (the form owns the page's only h1).

function Password({ isAr = false }: { isAr?: boolean }) {
  const [value, setValue] = useState("");
  return <PasswordField label="Password" value={value} onChange={setValue} isAr={isAr} />;
}

describe("the sign-in fields", () => {
  it("shows and hides the password", () => {
    render(<Password />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("minLength", "8");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("points out Caps Lock while it is on", () => {
    render(<Password />);
    const input = screen.getByLabelText("Password");
    fireEvent.keyDown(input, { key: "A", modifierCapsLock: true });
    expect(screen.getByRole("status")).toHaveTextContent("Caps Lock is on.");
    expect(input).toHaveAttribute("aria-describedby", "password-caps");
    fireEvent.keyUp(input, { key: "a", modifierCapsLock: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the email a required address field", () => {
    const onChange = vi.fn();
    render(<EmailField label="Email" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Email");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("type", "email");
    fireEvent.change(input, { target: { value: "sara@example.com" } });
    expect(onChange).toHaveBeenCalledWith("sara@example.com");
  });

  it("switches language and marks the current one", () => {
    const onChange = vi.fn();
    render(<LanguageSwitch lang="en" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(onChange).toHaveBeenCalledWith("ar");
  });

  it("gives the brand panel no heading, in either language", () => {
    const { rerender } = render(<SignInBrandPanel lang="en" title="Boutq" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Orders that move on their own.")).toBeInTheDocument();
    rerender(<SignInBrandPanel lang="ar" title="بوتيك" compact />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("طلبات تمضي من تلقاء نفسها.")).toBeInTheDocument();
  });
});
