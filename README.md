# SPAG

SPAG is a personal workspace that combines agenda management and spending tracking in one app. It is built as a full-stack Next.js application with protected routes, PostgreSQL persistence, type-safe APIs, responsive mobile navigation, light/dark theme switching, and browser notification support for upcoming agenda items.

## What It Does

### Agenda
- Create `task`, `reminder`, and `note` items
- Assign due dates and times with the timestamp picker
- Mark tasks/reminders as completed
- Mark items as priority (`sticky`)
- Pin notes separately from priority timeline items
- Add recurring reminders with `daily`, `weekly`, or `monthly` repeat intervals
- Search by title, content, category, and type
- Bulk select, bulk delete, bulk complete, bulk priority, and bulk category updates
- Switch timeline between `List` and `Grid`
- Switch notes independently between `List` and `Grid`
- Persist agenda view preferences in local storage
- Edit items directly from the timeline or from notification deep-links

### Spending
- View a simple ledger of saved spending entries
- Add transactions with description, amount, category, currency, and timestamp
- Use automatic timestamping or provide a manual date/time
- View a current "Today" total card

### Notifications
- Poll upcoming agenda items and surface in-app notifications
- Show due-today, overdue, 1-hour, and 3-hour reminder states
- Open linked agenda items directly from the notification panel
- Mobile notification trigger is integrated into the bottom navigation bar
- Browser notification API support is included
- Notification sound playback is supported with browser unlock handling

### App Shell / UX
- Protected dashboard shell for authenticated routes
- Sticky top app header with brand, realtime date/time, theme toggle, and app menu
- Mobile bottom navigation for Dashboard, Agenda, Spending, and notifications
- Slide-in burger menu with route shortcuts and logout action
- User-selectable light/dark mode with persistence
- PWA registration in production via service worker

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 4
- tRPC 11
- TanStack Query
- Better Auth
- Drizzle ORM
- PostgreSQL
- Biome
- Lucide React

## Project Structure

```text
src/
  app/
    (dashboard)/
      agenda/
      spending/
    api/
    login/
    signup/
  components/
    auth/
    ui/
  server/
    api/
    better-auth/
    db/
    web/
  styles/
  trpc/
```

## Local Development

### Prerequisites
- Node.js 18+
- npm
- PostgreSQL
- Docker optional, if you want to run the included database container

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Copy the example file:

```bash
cp .env.example .env
```

At minimum, this project currently expects these values to be available through the env schema in [src/env.js](/home/vistalife/codbox/spag/src/env.js):

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `BETTER_AUTH_SECRET` in production
- `VAPID_PRIVATE_KEY` optional depending on your notification setup

The existing `.env.example` includes:
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_GITHUB_CLIENT_ID`
- `BETTER_AUTH_GITHUB_CLIENT_SECRET`
- `DATABASE_URL`

If you use GitHub auth or web push in your environment, add the related values to `.env` as well.

### 3. Start the database

With Docker Compose:

```bash
docker-compose up -d
```

Or use the helper script:

```bash
./start-database.sh
```

### 4. Apply schema changes

For local schema sync:

```bash
npm run db:push
```

If you are generating migrations:

```bash
npm run db:generate
npm run db:migrate
```

### 5. Start the app

```bash
npm run dev
```

The development server runs on `http://localhost:3000`.

## Available Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — run the production server
- `npm run preview` — build and immediately start production locally
- `npm run check` — run Biome checks
- `npm run check:write` — run Biome with safe autofixes
- `npm run check:unsafe` — run Biome with unsafe autofixes
- `npm run typecheck` — run TypeScript checks
- `npm run db:push` — push Drizzle schema to the database
- `npm run db:generate` — generate Drizzle migrations
- `npm run db:migrate` — apply Drizzle migrations
- `npm run db:studio` — open Drizzle Studio

## Database Model Summary

The current schema includes:
- users, sessions, accounts, verification
- `agenda_items`
- `expenses`
- `push_subscriptions`

See [src/server/db/schema.ts](/home/vistalife/codbox/spag/src/server/db/schema.ts) for the source of truth.

## Current Product Notes

- Agenda is the most feature-complete area of the app.
- Spending currently focuses on transaction capture and a lightweight ledger view.
- Notifications are implemented in-app and tied to agenda timing states.
- The UI is optimized for both desktop and mobile usage, with persistent navigation and mobile-specific controls.

## PWA / Mobile Notes

- The app registers a service worker in production via [src/components/pwa-register.tsx](/home/vistalife/codbox/spag/src/components/pwa-register.tsx).
- Mobile routes use a bottom navigation bar for fast switching.
- Notification access is integrated into the mobile nav.
- Some UI state, such as agenda view preferences, is saved locally in the browser.

## Authentication

Authenticated dashboard routes are protected through Better Auth. Unauthenticated users are redirected to the login flow before they can access Agenda or Spending.

## Status

This repository is actively evolving. The README reflects the functionality implemented in the current codebase, not an aspirational roadmap.
