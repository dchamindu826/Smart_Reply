# Front-end guide

The web app (`frontend/`) is Next.js 16 + React 19 + TypeScript. Its look is final: keep the
layout, class names, wording and colours. Only the data underneath changes.

## How data flows

- `src/lib/api.ts` — `api.get/post/put/patch/del` against `/api/v1` (same origin; Next rewrites to the
  API in development, Nginx in production). Errors are `ApiError` with `.code` and a readable `.message`.
  `errorMessage(err)` gives text for a toast.
- `src/lib/upload.ts` — `uploadFile(file, name, purpose)` → file id (ticket, PUT, done).
- `src/lib/query.ts` — TanStack Query client and the shared query keys (`qk`).
- `src/features/*.ts` — **all** data hooks live here (`useQuery` / mutations). Components never call
  `fetch` or `api` directly; they call hooks from `features`.
- `src/features/session.tsx` — who is signed in (`useSession().me`).
- `src/context/AppContext.tsx` — app-wide state the designed screens already use (`useApp()`): role,
  screen, toasts, sheets, chats, calls, staff, templates, quick replies, products, media, call settings.
  It is built on the same TanStack caches, so invalidating a key refreshes both.
- `src/lib/adapters.ts` — maps API objects (`@smart-reply/shared`) onto the view types in `src/types`
  that the screens were designed with.
- Live updates arrive on Socket.IO (`src/lib/socket.ts`), handled in `AppContext`.

## Rules

1. Types come from `@smart-reply/shared` (API) or `src/types` (view shapes). No `any`.
2. Every list shows a loading state ("Loading…" in the existing `hint`/`sub` styles) and an empty state.
3. Every write shows a toast on success (`addToast`) and the API's message on failure (`reportError(err)`).
4. Hide buttons the user may not use (role / `me.permissions`), but remember the API is the real check.
5. No demo data, no simulators, no fake numbers in production screens. Mock data lives in `src/dev/` only.
6. New screens and forms reuse classes from `src/app/globals.css`: `card`, `card-h`, `card-b`, `btn`,
   `btn pri`, `btn sm`, `chip ok|w|b|i`, `list-row`, `f`, `f-in`, `f-row f2`, `hint`, `sheet`, `stats`.
7. Forms open in the slide-over sheet: `openSheet(<>…</>)`, `closeSheet()`.

## Running locally

```
npm run dev            # API :4000, worker, web :3000
npm run db:seed:demo -w backend   # demo company (development only)
```

Sign in at http://localhost:3000 with `manager@demo.test` / `Demo12345!` (also `staff1@demo.test`).
