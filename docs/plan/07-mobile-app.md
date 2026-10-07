# 07 · Mobile app

A Flutter app in `mobile/` for Android and iOS. Staff and managers use it; the system admin
console stays on the web.

It uses the same API and the same live events as the web app. Nothing in the back end is
built only for mobile, except push notifications and device registration.

## What goes in the first mobile release

| Area | Staff | Manager |
|---|---|---|
| Log in, accept invite, reset password | Yes | Yes |
| Chats: list with filters, thread, send text, photo, voice note, file, template, quick reply, internal note | Own customers and the pool | All |
| Window timer and "template only" state | Yes | Yes |
| Contact panel: owner, labels, call permission, history | Transfer own, release, take | Assign anyone |
| Calls: ring, answer, decline, decline with message, mute, speaker, hang up, call log | Yes | Yes |
| Status and breaks | Own | Own, plus Live status view |
| My day, My performance | Yes | Dashboard summary |
| Push notifications | Yes | Yes |
| Quick replies: use, add, edit own | Yes | Yes |

Left for the web in the first release: templates editor, broadcasts, catalog editing, IVR,
forwarding and call settings, assignment rules, reports detail, billing, roles, audit,
AI bot settings.

## Structure

```
mobile/lib/
  core/        api client, socket, auth storage, push, formatters, theme
  features/    auth, chats, calls, contacts, presence, me
  shared/      widgets used by more than one feature
```

- State: Riverpod. One repository per feature that wraps the API client and the socket.
- API models generated from the OpenAPI document produced by the back end, so they follow
  `packages/shared` without hand copying.
- Tokens in the platform's secure storage. Biometric unlock is optional and local.
- Offline: cache the chat list and the last messages of open chats; queue text messages
  written offline and send them on reconnect with their idempotency key. Media needs a
  connection.

## Push notifications

| Event | Android | iOS |
|---|---|---|
| New message in a chat I can see | FCM notification, grouped per chat | APNs notification |
| Chat assigned to me | FCM | APNs |
| Window closing within 2 hours | FCM | APNs |
| Incoming call | FCM high-priority data message → full-screen incoming call | PushKit VoIP push → CallKit |

Notification text never includes more than the sender's name and a short preview, and the
preview can be turned off per user.

## Calls on a phone

The hard part is ringing when the app is closed.

- **iOS**: a VoIP push must be reported to CallKit immediately or the system stops
  delivering them. The call screen is the system's.
- **Android**: a high-priority data push starts a foreground service with a full-screen
  incoming call notification. On recent Android versions this needs the full-screen intent
  and notification permissions, requested during setup with an explanation.
- Meta ends an unanswered call after roughly 30 to 60 seconds, and a push to a sleeping
  phone can take several seconds. So the ring order should try web and mobile at the same
  time, and the company's "ring for N seconds" setting must leave room for this.
- In call Stage A the phone itself holds the audio. In Stage B it joins the media server,
  which makes answering faster because the server has already accepted the call.
- Audio: `flutter_webrtc`. Route between earpiece, speaker and Bluetooth. Pause on a
  cellular call.

Test on real devices on mobile data, with the app closed, on at least two Android makers
with aggressive battery saving. Emulator results do not count for call ringing.

## Build order

1. Project setup, theme matching the web colours and fonts, API client, login.
2. Chat list and thread, read only, with live updates.
3. Sending: text, quick replies, templates, notes.
4. Media: camera, gallery, files, voice notes; viewing and downloading.
5. Contact panel and ownership actions.
6. Push notifications for messages.
7. Presence and breaks; My day.
8. Calls, Stage A, with CallKit and the Android call screen.
9. Call features that Stage B adds (hold, transfer, add) once the web has them.
10. Store listings, privacy labels, test tracks, release.

## Done when

- A staff member can do a full working day from the phone: receive, reply, send a photo and
  a voice note, take a call, go on a break.
- A message sent from web shows on the phone in the same second, and the reverse.
- An incoming call rings a closed app on both platforms and can be answered from the lock
  screen.
- Logging out, or being removed by the manager, clears local data and stops notifications.

## Store requirements to plan for

- Apple: an account-deletion path inside the app, a privacy label that lists messages,
  audio and contacts as collected data, and a reason string for microphone, camera, photos
  and notifications.
- Google: the data safety form, and a declaration for the full-screen intent and foreground
  service types used for calls.
- Both stores review apps that use another company's brand. The app is "Smart Reply", and
  describes itself as working with the WhatsApp Business Platform; it must not look like an
  official WhatsApp app.
