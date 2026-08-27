# Boutq OS Mobile

Native Expo 55 application for Boutq administrators, staff, and couriers. It uses the existing Supabase authentication, tenant isolation, and row-level security policies.

## Local run

1. Copy `.env.example` to `.env` and add the public Supabase URL and publishable key.
2. Run `npm install`.
3. Run `npm start`, then scan the QR code with Expo Go.

Never add the Supabase service-role key or any provider secret to this app.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run doctor`
- `npx expo export --platform web`

## EAS

After signing in with `eas login`, run `eas init` once to link the Expo project. Configure the two `EXPO_PUBLIC_SUPABASE_*` values for preview and production, then use:

- `eas build --profile preview --platform android`
- `eas build --profile production --platform all`

The first release contains login, tenant selection, dashboard summaries, orders, order details, and a WhatsApp customer action. Push notifications, barcode scanning, and protected status updates are planned as native follow-ups.
