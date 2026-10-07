# Smart Reply: production build plan

This folder is the plan for turning the current front end into a working, sellable product.
It is written to be handed to a coding agent (Antigravity) one phase at a time.

## Where the project stands today

Checked against commit `a330db6` on `main`.

| Area | State |
|---|---|
| Web front end | Next.js 16 + React 19, 28 screens for Manager and Staff. The design is final. |
| Data | All of it comes from `frontend/src/data/mockData.ts`. Nothing is saved; a page refresh resets everything. |
| Back end | None. There are no API calls anywhere in `frontend/src`. |
| Login | None. A header switch flips between "Manager" and "Staff" with hard-coded names. |
| System admin | No screens yet. |
| WhatsApp | Simulated. Messages and calls are generated in the browser. |
| Mobile app | Not in this repository. |
| Tests, CI, Docker | None. |

So "production level" means building everything behind the screens, plus the parts of the
front end that only exist as a demo today. The screens themselves stay as they are.

## The documents

Read them in this order.

| File | What it settles |
|---|---|
| [01-architecture.md](01-architecture.md) | The parts of the system, the three roles, technology choices, tenant isolation, security |
| [02-data-model.md](02-data-model.md) | Every database table, and how today's front-end fields map to them |
| [03-api-contract.md](03-api-contract.md) | REST endpoints and live events, screen by screen |
| [04-whatsapp-integration.md](04-whatsapp-integration.md) | How messaging, templates, media and calling work on Meta's Cloud API, with the limits that shape the design |
| [05-frontend-production.md](05-frontend-production.md) | What has to change inside `frontend/` without changing how it looks |
| [06-phases.md](06-phases.md) | The build order: phases 0 to 9, each with tasks, a "done when" list and a prompt to paste |
| [07-mobile-app.md](07-mobile-app.md) | The Flutter app for staff and managers |
| [08-deployment.md](08-deployment.md) | Servers, environments, backups, monitoring, launch checklist |

## How to use this with Antigravity

1. Merge this branch so `AGENTS.md` and `docs/plan/` are on `main`.
2. Open the repository in Antigravity.
3. For each phase in [06-phases.md](06-phases.md), paste that phase's prompt into the chat.
   Every prompt tells the agent which documents to read first.
4. Do not start a phase until the previous phase's "done when" list passes.
5. When a decision in these documents turns out to be wrong, change the document in the
   same pull request as the code. The plan must stay true.

## Things only you can do (start these now)

These take days or weeks and block real WhatsApp traffic. None of them is code.

1. **Meta Business verification** for the company that will own the Smart Reply app (LUMI AI).
2. **Create the Meta app**, add the WhatsApp product, and apply to become a **Tech Provider**
   so each customer's own number can be connected through Embedded Signup. The system
   admin runs the connection; the customer only logs in to Facebook once to approve it.
3. **App Review** for `whatsapp_business_management` and `whatsapp_business_messaging`
   (advanced access). Meta wants a screen recording of the real product, so this happens
   after Phase 3 works on a test number.
4. **A test WhatsApp Business number** that is not in use on the normal WhatsApp app.
5. **Domain names**, for example `app.smartreply.lk` and `api.smartreply.lk`.
6. **Privacy policy and terms of service** pages. Meta's review asks for the URLs.
7. Decide the **plans and prices** you sell (seats, included features).

## Decisions made in this plan that you should confirm

| Decision | Chosen here | Why | Change it if |
|---|---|---|---|
| Back-end stack | NestJS (TypeScript) + PostgreSQL + Redis | Same language as the front end; fits what was chosen earlier (Node + PostgreSQL) | You have a team that prefers something else |
| Hosting | One VPS with Docker Compose to start | Cheapest path that still works; matches the earlier VPS plan | You expect many companies in the first months |
| Seats | Up to 100 staff per company; only the manager adds or removes staff | Your earlier instruction | The plans you sell say otherwise |
| Who pays Meta | Each company adds its own payment method in its WhatsApp account | This is how Meta's Tech Provider model works | You become a Solution Partner with a credit line |
| Who connects the number | The system admin only. Managers see the number's health, read only | Your instruction | |
| AI bot | A separately paid add-on. The system admin activates it, configures it and trains it. Managers get a read-only view | Your instruction | |
| Call features | Two stages: simple browser calls first, media server second | Recording, IVR, transfer and conference cannot be done without a media server | See the open questions in 04 |
| Mobile app | Flutter | Matches your earlier starter | You prefer React Native |

## Open risks

1. **Calling needs a messaging limit of 2,000 or more** on the business number. A new number
   starts lower. Small customers may not qualify for calls on day one.
2. **Recording, IVR, queue ringing, transfer, conference and the voice bot** need a media
   server between Meta and the agent. That is the hardest part of the product. Phase 6
   starts with a short proof of concept before any commitment.
3. **Voice bot in Sinhala** depends on speech-to-text and text-to-speech quality that has
   not been tested for this project.
4. **Brand risk.** The README describes the chat screen as a "pixel-perfect reproduction" of
   WhatsApp Web with "authentic WhatsApp doodles". Selling a product that copies Meta's
   interface artwork can conflict with Meta's brand rules, and Meta reviews the app before
   it goes live. Get this checked before launch; using your own wallpaper art removes the
   question.
5. **Licence.** The README says the project is MIT licensed. If this is a commercial product,
   that line gives everyone the right to reuse the code. Decide whether the repository is
   private and what licence it carries.
