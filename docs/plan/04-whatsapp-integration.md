# 04 · WhatsApp integration

Everything here is built on Meta's WhatsApp Cloud API. Facts marked **(checked)** were read
from Meta's developer documentation on 7 October 2026; the links are at the end. Facts
marked **(confirm)** are from general knowledge of the platform and must be confirmed in the
documentation when that part is built. Meta changes limits and prices; re-read the linked
pages at the start of each phase.

## How a company connects its number

Smart Reply acts as a **Tech Provider**. The company keeps ownership of its WhatsApp
Business account and pays Meta directly.

Only a system admin connects a number. The manager's **Number & quality** screen is read only.

1. The system admin opens the company in the admin console and presses Connect WhatsApp.
2. Meta's **Embedded Signup** opens in a popup. Someone with access to the customer's
   Facebook business must log in there, pick or create the WhatsApp Business account and
   the phone number. That login cannot be skipped: the customer owns the account. In
   practice the system admin does this on a call with the customer, or sends the one-time
   connect link, which opens only this popup and nothing else in Smart Reply.
3. The popup returns a short-lived code, the account id (WABA id) and the phone number id.
   **(checked)**
4. The admin console posts these to `POST /admin/companies/:id/whatsapp/connect`. The back end then:
   1. exchanges the code for a business token, server to server;
   2. registers the phone number for Cloud API;
   3. subscribes the Smart Reply app to the account's webhooks; **(checked, all three steps)**
   4. stores the token encrypted and reads the number's name, quality and messaging limit.
5. The company must add a payment method in its WhatsApp account before it can send paid
   messages. **(checked)** Show this as a step on the screen.

There is also a manual path for the system admin: type the WABA id, the phone number id and
a token, then press Verify. Use it for numbers set up outside Embedded Signup. The back end
runs the same register, subscribe and read steps.

The platform-wide Meta settings (app id, app secret, Graph API version, verify token,
Embedded Signup config id) are edited by the system admin in the admin console and stored
encrypted in `platform_settings`. The app secret is needed to check webhook signatures, so
the server reads it at start and when it changes.

Requirements on our side: advanced access to `whatsapp_business_management` and
`whatsapp_business_messaging` through App Review. Onboarding is capped at 10 customers a
week until Business Verification and Access Verification are complete, then 200.
**(checked)**

A number that is active in the normal WhatsApp or WhatsApp Business phone app cannot be used
with Cloud API at the same time **(confirm)**. Say so on the Connect screen.

## Webhooks

One endpoint for all companies: `POST /api/v1/webhooks/whatsapp`.

- **Verification handshake**: Meta calls the URL with `hub.mode`, `hub.verify_token` and
  `hub.challenge`; answer with the challenge when the token matches. **(confirm)**
- **Signature**: every POST carries `X-Hub-Signature-256`, an HMAC-SHA256 of the raw body
  with the app secret. Reject anything that does not match. Read the raw body before any
  JSON parsing. **(confirm)**
- **Retries**: if we do not answer 200, Meta retries with decreasing frequency for up to
  7 days. **(checked)** So: store, enqueue, answer. Never process inside the request.
- **Size**: payloads can be up to 3 MB. **(checked)**
- **Duplicates and order**: events can arrive twice and out of order. Use the WhatsApp
  message id or call id plus the event kind as the dedupe key.

Subscribe to these fields:

| Field | Used for |
|---|---|
| `messages` | Incoming messages, and `statuses` for sent, delivered, read, failed |
| `calls` | Call connect, status and terminate events **(checked)** |
| `message_template_status_update` | Template approved, rejected, paused |
| `message_template_quality_update` | Template quality on the Templates screen |
| `phone_number_quality_update` | Quality rating and messaging limit on Number & quality |
| `account_update`, `account_alerts`, `business_capability_update` | Bans, restrictions, limit changes |

## Messaging

### Receiving

`messages` webhook → find the company by `phone_number_id` → find or create the contact by
the sender's number → find or create the conversation → store the message → move
`window_expires_at` to now + 24 hours → reopen if resolved → run assignment and keyword
rules → run the bot if it is active → push `message.created`.

Media arrives as an id. Download it at once and copy it to our storage: media ids from
webhooks last 7 days, uploaded ones 30 days, and download URLs expire after 5 minutes.
**(checked)**

### Sending

`POST /<PHONE_NUMBER_ID>/messages` on the Graph API. Three kinds:

| Kind | When allowed | Cost |
|---|---|---|
| Free-form (text, media, interactive) | Only inside the 24-hour window | Free **(checked)** |
| Utility template | Any time | Free inside the window, charged outside **(checked)** |
| Marketing template | Any time, to opted-in customers | Always charged **(checked)** |
| Authentication template | Any time | Charged outside the window **(checked)** |

Meta has charged per delivered message, not per conversation, since 1 July 2025.
**(checked)** A customer who arrives from a Click-to-WhatsApp ad or a Facebook Page button
and gets a reply within 24 hours opens a 72-hour window in which all messages are free.
**(checked)**

The front end already shows this model: the window timer, "send an approved template
instead", and the Billing screen's free replies against charged templates.

Status events (`sent`, `delivered`, `read`, `failed`) update the message row and push
`message.status`. Each status event includes pricing information **(confirm the exact
field names)**; store the category and whether it was billable, and add it to `usage_daily`
for the Billing screen.

### Media limits

| Type | Formats | Maximum |
|---|---|---|
| Image | JPEG, PNG | 5 MB |
| Audio | AAC, AMR, MP3, M4A, OGG | 16 MB |
| Video | MP4, 3GPP (H.264 video, AAC audio) | 16 MB |
| Document | PDF, Word, Excel, PowerPoint, text | 100 MB |
| Sticker | WebP | 100 KB static, 500 KB animated |

**(checked)** These match the numbers already written on the Quick replies and Media gallery
screens. Enforce them on the server when the upload URL is requested.

Voice notes recorded in the browser must be sent as OGG with the Opus codec to appear as a
voice message rather than a file **(confirm)**. Browsers record WebM or MP4 by default, so a
worker converts with ffmpeg before upload.

### Templates

Create with `POST /<WABA_ID>/message_templates`; Meta reviews each one. Status and rejection
reason arrive by webhook. Keep our `templates` table as a copy of Meta's list and run a sync
when the manager opens the screen and once a day. **(confirm endpoint details)**

### Broadcasts

A broadcast is a marketing template sent to every opted-in contact with a label.

- Send through the queue at a controlled rate.
- Never exceed the number's messaging limit. New numbers start low and move up through
  tiers as quality holds **(confirm current tier numbers)**. Read the live limit from
  `whatsapp_accounts`.
- Skip contacts without `marketing_opt_in` and blocked contacts.
- Stop the broadcast if the quality rating drops while it runs.

### Business profile and number health

Business profile fields are read and written through the phone number's profile endpoint.
Quality rating, messaging limit and name status come from the phone number object and the
quality webhooks. **(confirm endpoint details)**

## Calling

### What Meta provides

- **User-initiated calls** (customer calls the business): available wherever Cloud API is.
  **(checked)**
- **Business-initiated calls**: available except where the business number's country is the
  US, Canada, Egypt, Vietnam or Nigeria. Sri Lanka is not on that list. **(checked)**
- Calling is **off by default** and the number needs a **messaging limit of 2,000 or more**.
  **(checked)** A newly connected number may not qualify. The Call settings screen must show
  "calling not available yet" with the reason.
- Audio is WebRTC (Opus). Signalling is either Graph API calls plus the `calls` webhook, or
  SIP. **(checked)**

Enable and configure with `POST /<PHONE_NUMBER_ID>/settings`:

```json
{
  "calling": {
    "status": "ENABLED",
    "call_icon_visibility": "DEFAULT",
    "callback_permission_status": "ENABLED",
    "call_hours": {
      "status": "ENABLED",
      "timezone_id": "Asia/Colombo",
      "weekly_operating_hours": [
        { "day_of_week": "MONDAY", "open_time": "0800", "close_time": "2000" }
      ],
      "holiday_schedule": []
    }
  }
}
```

**(checked)** Sending `call_hours` replaces the whole schedule. The Call settings screen's
"Call hours" section maps directly onto this.

### Incoming call

1. `calls` webhook, event `connect`, with a call id and an SDP offer. **(checked)**
2. We have roughly 30 to 60 seconds to answer before Meta ends the call as not answered.
   **(checked)** The "ring for 20 seconds, then next person" setting must fit inside this.
3. `POST /<PHONE_NUMBER_ID>/calls` with `action: "pre_accept"` and our SDP answer, then
   `action: "accept"`. Or `action: "reject"`. **(checked)**
4. To end: `action: "terminate"`. This must be sent even when the audio has already stopped.
   **(checked)**
5. `terminate` webhook gives status, start time, end time and duration in seconds.
   **(checked)**

### Outgoing call

1. The customer must have given **call permission**. Ask with an interactive message of type
   `call_permission_request` (free-form inside the window, or as a template outside it).
   **(checked)**
2. Limits on asking: at most 1 request in 24 hours and 2 in 7 days per customer. The limits
   reset after a connected call. **(checked)**
3. The customer's answer arrives as a `call_permission_reply` webhook with `accept` or
   `reject`, whether it is permanent, and an expiry time. Temporary permission lasts 7 days.
   **(checked)**
4. With `callback_permission_status` enabled, a customer who calls us first grants permission
   automatically. **(checked)**
5. Four unanswered business calls in a row revoke the permission. **(checked)**
6. Check before dialling: `GET /<PHONE_NUMBER_ID>/call_permissions?user_wa_id=<number>`.
   **(checked)**
7. Dial: `POST /<PHONE_NUMBER_ID>/calls` with `action: "connect"` and an SDP offer. Events
   `RINGING`, `ACCEPTED` or `REJECTED` follow, then `terminate`. Error `138006` means no
   permission. **(checked)**

The front end's "call permission" badge and "send call permission template" button already
fit these rules. Add the three states (none, temporary with expiry, permanent) and disable
the request button while a limit applies, with the reason.

### The design problem: who holds the audio

Meta gives one audio stream per call. The screens promise much more than "answer and talk":

| Feature on the screens | Needs a media server |
|---|---|
| Answer, decline, mute, hang up, call log | No |
| Ring several staff, round robin, longest idle | Partly: signalling can do it, but only one browser can hold the audio |
| IVR greeting and "press 1" menu | Yes |
| Hold with the caller hearing something | Yes |
| Recording, pause recording, announcement | Yes |
| Warm and blind transfer, add a colleague | Yes |
| Forward when on break, away, after hours | Yes for audio; "send a message instead" needs none |
| Live transcript, AI summary, voice bot | Yes |

So calling is built in two stages.

**Stage A (Phase 6, first half).** The agent's browser or phone is the WebRTC peer. The back
end only relays SDP between the agent and Meta. Delivers: ring, answer, decline, decline
with message, mute, hang up, missed-call message, call log, permission flow, outgoing calls.

**Stage B (Phase 6, second half).** A media server sits in the middle. Meta's call ends at
the server; agents join from web and mobile as separate legs. Delivers everything else in
the table.

Two ways to do Stage B. Phase 6 opens with a proof of concept of at most one week to choose:

| Option | How | For | Against |
|---|---|---|---|
| **1. SIP to a telephony server** (FreeSWITCH or Asterisk) | Turn on Meta's SIP option; calls arrive at our server over TLS. Agents connect by WebRTC | IVR, queues, hold music, recording, transfer and conference are built-in features | Another system to run and secure; SIP must be enabled by Meta on the number |
| **2. Graph API signalling to a WebRTC media server** (LiveKit, mediasoup or Janus) | Our server answers Meta's SDP offer itself and places the caller in a room | One technology for web and mobile; easy to attach AI audio | IVR, queue and transfer logic is ours to write |

The proof of concept must show, on a real test number: an incoming call answered by the
server, a greeting played, a key press read, the call bridged to a browser, a recording
file saved, and a transfer to a second browser. Whichever option does this with less custom
code wins. Record the decision in this file.

Do not build Stage B features before that decision.

## AI bot

The AI bot is a paid add-on that LUMI AI controls completely.

- **Who does what.** A system admin activates the add-on for a company, sets its plan,
  expiry and monthly reply limit, writes the prompt and persona, uploads knowledge
  documents and saves corrected answers from real chats as training examples. A manager
  sees the add-on state, a plain summary of what the bot does, usage against the limit and
  the logs, and can press "request activation". Managers and staff can still take a single
  chat over from the bot and hand it back; that is day-to-day work, not configuration.
- **When the bot runs.** Only when the company's add-on is `active`, the monthly limit is
  not used up, the global off switch is not set, and the bot is active on that conversation.
  In every other case the message goes to people as if there were no bot.
- **Training.** "Training" here means improving the prompt, the knowledge documents and the
  example answers the bot is given. It is not fine-tuning a model. The system admin's AI
  console shows low-confidence and handed-off replies so they can be corrected and saved as
  examples.
- **Chat bot.** Runs in a worker after an incoming message when the conditions above hold. Inputs: the company's prompt and persona, recent messages, catalog and
  knowledge documents. Output: a reply with an intent and a confidence score. Below the
  company's confidence threshold, or when a handoff rule matches (negotiation, complaint,
  asks for a person), it sends the fallback message, assigns a human and stops. Every run
  writes an `ai_bot_logs` row. All fields map to `AIBotSettings` in the front end.
- **Call transcript and summary.** After Stage B produces a recording: speech to text, then a
  summary, saved on the call and offered as an internal note.
- **Voice bot.** Stage B plus streaming speech to text and text to speech. Build last. Test
  Sinhala and Tamil quality with real customers' phrases before promising it.
- The AI provider sits behind one internal interface so it can be swapped. Customer text
  goes to that provider; say so in the privacy policy and let a company turn the bot off
  entirely.

## Sources

- [WhatsApp Business Calling API overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling)
- [Business-initiated calls](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls)
- [User-initiated calls](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls)
- [User call permissions](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions)
- [Call settings](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings)
- [Media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media)
- [Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview)
- [Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- [Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
