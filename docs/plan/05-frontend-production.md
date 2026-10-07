# 05 · Front end: from demo to production

**The rule for this whole document: what the user sees does not change.** Same layout, same
classes in `globals.css` and `whatsapp-chat.css`, same wording, same themes and wallpapers.
The work is underneath.

Findings below were read from the code at commit `a330db6`. The project could not be
installed or built in the environment where this plan was written (the package registry was
not reachable), so nothing here comes from running the app. Phase 0 starts by running
`npm ci`, `npm run lint`, `npx tsc --noEmit` and `npm run build` and recording the result.

## What is there today

| Fact | Where |
|---|---|
| One route. Every screen is chosen by a `screen` string in React state, with a `switch` in the shell | `src/app/page.tsx`, `src/components/layout/Shell.tsx` |
| All state for all screens in one 769-line context | `src/context/AppContext.tsx` |
| All data from one mock file | `src/data/mockData.ts` (1,016 lines) |
| No network calls of any kind | no `fetch`, no WebSocket anywhere in `src` |
| No login. A header button switches role | `src/components/layout/Header.tsx` lines 121 and 128 |
| Hard-coded people | `AppContext.tsx`: "Madushan" and "Nimal" as the current user; staff ids `s1`, `s2`, `s3` mapped to names by hand in `setOwner` |
| Hard-coded records in logic | `AppContext.tsx`: incoming calls always use contact `c7` and conversation `v7`; `convId.replace('v', 'c')` finds a contact from a conversation id |
| Simulation in the live paths | `simulateCustomerReply`, `simulateIncomingCall`, the AI bot simulators (`AIBotScreen.tsx`, timers), random ids from `Math.random()` |
| 37 buttons that only show a message | See the list below |
| Short field names and text instead of data | `src/types/index.ts`; mapping in [02-data-model.md](02-data-model.md) |
| Fixed date text | `TODAY_STRING = 'Wednesday 30 September 2026'` used on the Dashboard |
| Voice note recorder opens the microphone for the level meter but records no audio | `src/components/modals/VoiceRecordingWidget.tsx` |
| Attachments are browser-only object URLs | `InboxScreen.tsx` line 131, `QuickRepliesScreen.tsx` line 215 |
| Nothing renders on the server; the shell waits for `mounted` and shows a loading box | `Shell.tsx` line 63 |
| A LAN address in config | `next.config.ts`: `192.168.8.102` in `allowedDevOrigins` |
| Fonts loaded by `<link>` from Google | `src/app/layout.tsx` |
| 16 wallpaper PNGs of 300 to 560 KB each, 5 MB in total | `frontend/public/` |
| The 182 KB HTML prototype is still in the app folder | `frontend/Smart Reply Admin Console.html` |
| Raw HTML injection for product artwork | `CatalogScreen.tsx` line 72 (`dangerouslySetInnerHTML`), fed by `PRODUCT_ARTWORK` |
| One customer's business baked into types | `Product.k: 'pantry' | 'vanity' | 'wardrobe' | 'overhead'`, `MediaCategory`; the names "Madushan", "Nimal", "Sachini" or "Ruwan" appear in 20 files besides the mock data |
| 501 inline `style={{…}}` blocks, 7 `as any` casts | across `src/components` |
| No tests, no CI, no Dockerfile, no environment variables | repository root |

### Buttons that only show a message today

Each of these needs a real form, dialog or action. Counts are `onClick={() => addToast(…)}`
handlers per file.

| File | Count | Examples |
|---|---|---|
| `LabelsScreen.tsx` | 7 | New label, every Edit |
| `StaffManageScreen.tsx` | 3 | Add staff (invite), open profile |
| `ContactsScreen.tsx` | 3 | Import CSV, new customer, export |
| `CallsScreen.tsx` | 3 | Download recording, notify call-back queue, export CSV |
| `TemplatesScreen.tsx` | 2 | Resubmit, open editor |
| `CatalogScreen.tsx` | 2 | Copy catalog link, new product |
| `IVRScreen.tsx` | 2 | Upload audio, record greeting |
| `AssignmentRulesScreen.tsx` | 2 | Save rules, new keyword rule |
| One each | 13 | Reports export, Billing invoice, Audit export, Broadcast new, Business profile save, Call settings save, Forwarding save, Integrations test, Live status action, My performance export, Profile save, Dashboard export, a Header action |

Also: "Mark resolved" and "Block" in `InboxScreen.tsx` (lines 245 and 286) only show a
message. Assignment rules, Business profile, Profile settings and parts of Call settings use
`defaultChecked` and `defaultValue` inputs whose values are never read, so "Save" saves nothing.

## Target structure

```
frontend/src/
  app/
    (auth)/login, forgot-password, reset-password, invite/[token]
    (app)/layout.tsx              shell: rail + header, requires a session
    (app)/dashboard, chats, chats/[conversationId], calls, customers, labels,
          ai-bot, team/status, team/staff, team/rules, team/progress,
          media, templates, catalog, broadcasts, quick-replies,
          calls/settings, calls/ivr, calls/forwarding,
          reports, billing, setup/business, setup/number, setup/roles,
          setup/integrations, setup/audit,
          my/day, my/performance, my/profile
    (admin)/admin/companies, companies/[id], plans, usage, health, audit
    error.tsx, not-found.tsx, loading.tsx
  components/        unchanged look; props become real data
  features/<area>/   hooks and API calls per area: chats, calls, team, content, setup, admin
  lib/
    api/             typed client built on the shared schemas
    realtime/        one socket, typed events
    auth/            session, permission checks
    format/          dates, phone numbers, money, durations
  dev/               mock server and the simulators, never in a production bundle
```

Old ids such as `?screen=chats` redirect to the new paths.

## The changes, in order

### 1. Make it build clean and stay clean
- Run install, lint, type-check and build; fix what fails.
- Add `typecheck`, `test`, `format` scripts. Add Prettier. Fix the `lint` script to `eslint .`.
- Remove the LAN address from `next.config.ts`; read allowed origins from the environment.
- Move `Smart Reply Admin Console.html` to `docs/prototype/`.
- Add `.env.example` and a typed environment reader that fails at start if a value is missing.

### 2. Real URLs
- One route per screen as in the tree above. The rail uses links. Browser back and refresh
  keep the user where they were. The open conversation is in the URL.
- Role decides which routes exist. A staff member who types a manager URL gets the
  not-found page.

### 3. Clear types
- Replace `src/types/index.ts` with types generated from `packages/shared`.
- Rename the short fields everywhere (`n` → `name`, `pv` → `lastPreview`, and so on).
- Dates become ISO strings; formatting moves to `lib/format`. Delete `TODAY_STRING`.
- Every list item gets a stable `id`. No more editing by array position.
- Remove the 7 `as any` casts.

### 4. Data layer
- Server data through TanStack Query hooks in `features/*`: lists, details, mutations with
  optimistic updates for sending a message, changing owner, labels and presence.
- `AppContext` shrinks to interface state only: theme, wallpaper, rail open, open sheet,
  sound on or off. Split it so a new message does not re-render the settings screens.
- The live socket writes into the query cache. A dropped socket reconnects and refetches.
- Until the back end exists (Phase 1), the same hooks talk to a mock server (MSW) seeded
  from today's `mockData.ts`. The app keeps working exactly as now, through the real path.

### 5. Sessions and permissions
- Login, forgot password, reset password and accept-invite pages in the existing visual style.
- Remove the role switch from the header. Role and name come from `GET /me`.
- A `can('templates.create')` helper drives which buttons show. The server still checks.
- Handle expiry: a 401 tries one refresh, then sends the user to login and returns them to
  the same URL afterwards.

### 6. Remove the demo from the product
- Move `simulateCustomerReply`, `simulateIncomingCall`, the bot simulators' canned answers
  and the mock data into `src/dev/`, loaded only when `NEXT_PUBLIC_DEMO=1`.
- The manager's AI Bot screen becomes **read only**: add-on state, plan and expiry, usage
  this month, a summary of the bot's behaviour, the logs tab, and a "Request activation"
  button when the add-on is off or expired. Every input, switch, Save button and both
  simulators move to the system admin's "Company → AI bot" screen, which reuses the same
  components.
- The manager's Number & quality screen stays as it looks today but has no connect or
  disconnect action.
- Replace the 37 message-only buttons with working forms. Build them from the existing
  sheet, form and button styles.

### 7. Files and voice notes
- Attachments upload to storage through `POST /files`, with progress, cancel and retry.
  Check type and size against WhatsApp's limits before uploading.
- The voice recorder actually records (MediaRecorder), shows the real length and uploads.
- Images and videos show from signed URLs with a placeholder while loading.
- Product artwork comes from uploaded images. Delete `PRODUCT_ARTWORK` and the
  `dangerouslySetInnerHTML` in `CatalogScreen.tsx`.

### 8. Every screen handles four states
Loading, empty, error with a retry, and "you do not have access". Add `error.tsx` and
`not-found.tsx`. Long lists (chats, messages, calls, customers, audit) are paged and
virtualised.

### 9. Calls in the browser
- Microphone permission asked the first time a call is answered, with a clear message when
  it is refused.
- Ringing follows `call.ringing` events instead of a fake row in the call list.
- Ring continues when the tab is in the background; a browser notification shows the caller.
- One active call per user across tabs.

### 10. Per-company content
- Remove the fixed product kinds and media categories; they come from the API.
- Company name, number and staff names come from the session and the API. Search the
  code for "Madushan", "Nimal", "Sachini" and "Ruwan" and leave none outside `src/dev/`.

### 11. System admin screens
New, in the same visual language as the manager screens:

| Screen | Contents |
|---|---|
| Companies | Table: company, manager, staff used of limit, number status, plan, status. Add company |
| Company detail | Plan and seat limit (never above 100), managers, usage, suspend or activate, "open as manager" with a reason |
| Plans | Name, seat limit, price, features |
| Usage | Messages, calls, storage and Meta cost by company and month |
| Health | Queue depth, webhook failures, numbers with low quality or restrictions |
| Meta settings | App id, app secret, Graph API version, Embedded Signup config id, system token (all secrets masked), "Test connection" |
| Webhook | Callback URL, verify token, subscribed fields, per-company subscription state, recent events, failures with "run again", "send test event" |
| Company → WhatsApp | WABA id, phone number id, number, token state, quality, messaging limit, calling. Connect by Embedded Signup, enter ids by hand, send connect link, verify, re-subscribe, disconnect |
| AI: platform | Provider, key, default model, default prompt and rules, global off switch |
| AI: add-on plans | Price, monthly reply limit, voice included |
| AI: companies | Per company: add-on state, plan, expiry, usage, cost, activation requests. Activate, pause, renew |
| Company → AI bot | The full settings from today's `AIBotScreen.tsx`, knowledge documents, training examples, simulator, logs |
| Audit | Platform-level actions, including every impersonation and every change to Meta, webhook, WhatsApp and AI settings |

### 12. Quality bar
- **Accessibility**: the rail uses symbols such as `◧` and `☏` as icons; give every control
  a text name, make all dialogs and sheets trap focus and close on Escape, keep a visible
  focus ring, check contrast in both themes.
- **Languages**: the interface mixes English and Sinhala in fixed strings. Move interface
  text to message files (English first; Sinhala and Tamil can follow) and keep customer
  content as typed.
- **Performance**: fonts through `next/font`; wallpapers converted to WebP or small
  repeating tiles; screens loaded on demand; the 4,800 lines of global CSS stay but are
  checked for unused rules.
- **Security headers**: content security policy, no inline scripts, frame denial, strict
  referrer policy.
- **Monitoring**: error reporting from the browser with the release version, without
  message text.

### 13. Tests
| Kind | What |
|---|---|
| Unit | Formatters, the window timer (`utils/windowTime.ts`), permission helper |
| Component | Composer, chat list filters, owner picker, call controls |
| End to end (Playwright) | Log in as manager, as staff, as system admin; send a message; change owner; add and remove staff up to the seat limit; staff cannot open manager pages |
| Visual | A screenshot of every screen in light and dark taken **before** the refactor; the same screenshots must match after each step |

The visual baseline is what proves the look did not change. Take it first.

## Done when

- `npm run lint`, `typecheck`, `test` and `build` pass in CI with no warnings ignored.
- No file outside `src/dev/` imports mock data or contains a customer's name.
- Every button on every screen does something real or is hidden by permission.
- A refresh on any screen returns to that screen with the same data.
- Visual comparison against the baseline shows no unintended differences.
