# Smart Reply mobile

Android and iOS app for managers and staff: WhatsApp chats, customer calls, customers, status
and breaks. Expo SDK 54 (React Native 0.81, React 19.1), expo-router, TypeScript strict,
TanStack Query v5 and Socket.IO. API types come from `packages/shared` (`@smart-reply/shared`).

## Run it

```bash
# once, at the repo root: installs workspaces and builds packages/shared/dist
npm install            # or: npm run build:shared

cd mobile
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_URL
npx expo start
```

- **Chats, customers, status, templates and voice notes work in Expo Go.**
- **Calls and push notifications need a development build** (`react-native-webrtc` and
  `react-native-incall-manager` are native modules; Expo Go on Android cannot receive push since
  SDK 53). Build one with `eas build --profile development --platform android` (or `ios`), install
  it, then `npx expo start` and open the project from the dev client. Without the native module the
  app shows "Calls need the Smart Reply app built with EAS" instead of crashing.

| Setting | Where |
|---|---|
| `EXPO_PUBLIC_API_URL` | API address without `/api/v1`. Default `http://10.0.2.2:4000` (Android emulator → host). People can also change it on the sign-in screen ("Server: … Change"); it is saved on the phone. On a real phone use your computer's LAN IP, e.g. `http://192.168.1.20:4000`. |
| `EAS_PROJECT_ID` | Printed by `eas init`. Needed for Expo push tokens. |
| `GOOGLE_SERVICES_JSON` | Path to (or EAS file secret for) the Firebase `google-services.json`, needed for Android push. |

Local storage driver: upload/download links that point at `localhost` are rewritten to the server
address the app uses, so file uploads work from a phone against a dev API.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict). Typed routes are generated in `.expo/types` by `expo start`. |
| `npm test` | Jest (`jest-expo`) unit tests for pure helpers: time/window countdown, cache reducers, call state, URLs, uploads. |
| `npm run export:android` | Bundles the JS for Android (sanity check of the Metro build). |
| `npm run icons` | Redraws the icon, adaptive icon, splash and notification icon in `assets/`. |

## Structure

```
app/                     expo-router routes
  sign-in, forgot-password
  (app)/_layout          socket, calls, push (signed-in only, via Stack.Protected)
  (app)/(tabs)/          index (Chats), calls, customers, me
  (app)/chat/[id]        thread + composer
  (app)/contact/[id|new] customer info / new customer
  (app)/template         pick an approved template, fill {{n}}, send or start a chat
  (app)/schedule-call
  (app)/me/*             status, breaks, performance, profile, password, team (managers)
src/
  auth/      tokens in expo-secure-store, single-flight refresh, AuthProvider
  lib/       API client (Bearer + x-sr-client: mobile, 401 → refresh → retry), upload, time, config
  features/  TanStack Query hooks per area (conversations, contacts, calls, content, me, team)
  realtime/  Socket.IO provider and pure cache reducers for live events
  calls/     WebRTC (guarded require), call state reducer, CallProvider, full-screen call UI
  push/      expo-notifications setup, device registration, tap → open chat
  chat/ contacts/ callsui/ me/ ui/   components
```

## Calls (WhatsApp Business Calling, Stage A)

- Incoming: socket `call.ringing { call, sdpOffer }` → full-screen ringing UI (vibrates). Answer =
  `RTCPeerConnection` (STUN `stun.l.google.com:19302`), `setRemoteDescription(offer)`, microphone,
  `createAnswer`, `setLocalDescription`, **wait for ICE gathering to complete** (no trickle, max 6 s),
  then `POST /calls/:id/answer { sdpAnswer }`. Decline, or decline with a message.
- Outgoing (chat header, customer screen, call log): offer with complete ICE → `POST /calls
  { contactId, sdpOffer }` → socket `call.signal { callId, sdpAnswer }` → `setRemoteDescription`.
  `CALL_PERMISSION_MISSING` offers "Ask permission" (`POST /contacts/:id/call-permission-request`).
- `call.updated` with an outcome other than ringing/ongoing ends the screen (e.g. "Answered by …").
- Mute toggles the local audio track; speaker uses `react-native-incall-manager` when present.
- Not done yet (see docs/plan/07): ringing a closed app (FCM data push + full-screen intent on
  Android, PushKit + CallKit on iOS). Today an incoming call rings while the app is open or in the
  foreground with a live socket.

## Push notifications

The app asks for permission after sign-in, gets an Expo push token and registers it with
`POST /me/devices { platform, pushToken }`; it is removed on sign-out. Android channels:
`messages` (high) and `calls` (max). The API should send `data.conversationId`; tapping such a
notification opens the chat (also from a cold start). Banners for the chat already on screen are
suppressed.

Credentials (once per app):

- **Android (FCM v1):** create a Firebase project with package `lk.lumiai.smartreply`, download
  `google-services.json` (set `GOOGLE_SERVICES_JSON` as an EAS file env var), create a service
  account key with the Firebase Cloud Messaging API enabled and upload it with
  `eas credentials` → Android → Push Notifications: FCM V1.
- **iOS (APNs):** `eas credentials` → iOS → Push Notifications → let EAS create an APNs key (or
  upload a `.p8` key from the Apple Developer portal).

## Builds with EAS

```bash
npm i -g eas-cli && eas login
eas init                                   # sets the project id; put it in EAS_PROJECT_ID
eas env:create --name EXPO_PUBLIC_API_URL --value https://<your-api> --environment production
eas build --profile development --platform android   # dev client APK (calls, push)
eas build --profile preview --platform android       # internal APK for testers
eas build --profile production --platform android    # AAB for Google Play
eas build --profile production --platform ios        # IPA for TestFlight / App Store
eas submit --profile production --platform android|ios
```

Profiles are in `eas.json` (`development`, `development-simulator`, `preview`, `production`);
versions are managed remotely and auto-incremented for production.

## Store submission notes

- Name "Smart Reply", bundle id / package `lk.lumiai.smartreply`. Describe it as working with the
  WhatsApp Business Platform; do not use WhatsApp's logo or look like an official WhatsApp app.
- Apple: microphone, camera and photo-library reasons are in `app.config.ts`; privacy label must
  list messages, audio, photos and contacts. Apple requires an in-app account-deletion path —
  not built yet (needs an API endpoint).
- Google: data safety form; if ringing a closed app is added later, declare the full-screen
  intent and the phone-call foreground service type.
- Test calls on real devices on mobile data; emulators do not count for call ringing.
