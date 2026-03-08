# Teux Planner

Offline-first personal planner built with Next.js + TypeScript + Tailwind + Dexie.

## Implemented

### Phase 1
- Weekly planner grid + bottom holding lists
- CRUD tasks (add, inline edit, complete, delete)
- Drag/drop reorder and move (day-to-day, list-to-list)
- IndexedDB persistence
- Today view (`/today`)

### Phase 2A
- Left Preferences panel
- Accent color, columns (3/5/7), text size, spacing
- Show completed, bullet style, week start mode (Monday/Today/Yesterday)
- Show lines, light/dark theme, celebrations
- Preference persistence in IndexedDB

### Phase 2B
- Recurring task modal (form-based)
- Repeat every N day/week/month
- Weekly weekday selection
- Starting date
- Delete all instances
- View all instances

### Phase 3
- Focus timer in Today view
- Local focus session tracking
- Analytics page (`/analytics`)
  - weekly switching
  - daily totals
  - hour-of-day totals (0-23, scrollable)
  - real-time updates while timer is running
  - auto-advance to next week when week changes

### Phase 4 polish
- Export/Import JSON backup
- Search
- Keyboard shortcuts (`[`, `]`, `t`, `/`)
- Undo snackbar for delete and move
- Keyboard-accessible controls and labels

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run lint
npm run build
npm run start
```

## Deploy

Deploy directly on Vercel as a Next.js project. No backend or env vars are required.
