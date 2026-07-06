## Goal
Split every phone input into two fields — country code + local number — with Bahrain (+973) prefilled. Save concatenated E.164 (e.g. `+97312345678`) into the existing single `phone` column, so no DB changes are needed.

## New component: `src/components/phone-input.tsx`
- Props: `value: string | null`, `onChange: (fullE164: string) => void`, `placeholder?`, `className?`.
- Renders a small shadcn `Select` for country code + an `Input` for the local number, side by side, RTL-aware.
- Country codes (default +973 first): 🇧🇭 +973 Bahrain, 🇸🇦 +966 Saudi, 🇦🇪 +971 UAE, 🇰🇼 +965 Kuwait, 🇶🇦 +974 Qatar, 🇴🇲 +968 Oman.
- Parses incoming `value`: matches longest known code prefix → sets code + local; falls back to `+973` when empty/unrecognized.
- Emits `code + localDigits` (digits-only local part) on change, empty string when local is empty.

## Files to edit
1. `src/routes/_authenticated/customers.tsx` — replace the plain `<Input>` phone field in the customer dialog (line 218) with `<PhoneInput>`.
2. `src/routes/_authenticated/settings.tsx` — replace business phone `<Input>` (line 138) with `<PhoneInput>`.
3. `src/routes/_authenticated/orders.$id.tsx` — replace the manual-entry phone `<Input>` in the WhatsApp send dialog (line 1292) with `<PhoneInput>` (already used with country code, this just formalizes it). Leave the phone-search box alone — it's a filter, not a phone entry.

## Out of scope
- No DB migration (single `phone` column keeps working).
- Existing saved numbers are shown as-is (component parses known Gulf prefixes; unknown ones default to +973 with the raw digits preserved as the local part).
- No changes to the WhatsApp-link builders — they already accept the full number.
