# Boutq OS Mobile

Expo application for Boutq administrators. The production admin website is the single source of truth: the app renders its responsive interface and therefore uses the same authentication, permissions, data, and business logic as the browser version.

## Local run

1. Copy `.env.example` to `.env`. `EXPO_PUBLIC_BOUTQ_ADMIN_URL` is optional and defaults to `https://boutq.store/admin`.
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

The app keeps trusted `boutq.store` pages inside its secure web view, opens WhatsApp and other external links in the appropriate app, supports Android back navigation and pull-to-refresh, and provides a native offline/retry state.
