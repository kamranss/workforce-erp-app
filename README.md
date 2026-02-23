# ArchBuild React App

ArchBuild is a role-based workforce and project operations app for construction teams.  
This repository contains the frontend (Next.js + React) used as a portfolio project.

## What This Project Does

The app helps teams manage:

- authentication by 6-digit passcode
- daily clock in / clock out with geolocation
- projects and customers
- task assignment and tracking
- hours reporting and manual corrections
- payments, expenses, bonuses, and finance views
- personal profile and earnings summary

## Main User Roles

The UI and available tabs are role-driven:

- `admin` / `superadmin`
  - Dashboard (`home`)
  - Projects + Customers (`projects`)
  - Admin finance area (`finance`)
  - Hours reporting/management (`hours`)
  - Profile (`profile`)
- `user` / `employee`
  - Clock actions (`clock`)
  - Hours report (`hours`)
  - Payments view (`payments`)
  - Profile (`profile`)

## Login Notes

- Standard login expects a 6-digit passcode.
- A **Quick Login** button exists on the login page for portfolio/demo usage.
- Quick Login auto-fills `123456` and submits immediately.

File: `src/pages/Login.jsx`

## Tech Stack

- Next.js 14
- React 18
- React Icons
- CSS in `src/styles/app.css`
- Custom API layer built on `fetch`

## App Structure

- `app/layout.js` - Next root layout and global CSS import
- `app/page.js` - mounts the React app
- `src/App.jsx` - provider composition root
- `src/components/AppShell.jsx` - tab shell, loading indicators, pull-to-refresh
- `src/context/` - auth, UI, and app-level state providers
- `src/pages/` - feature pages (Home, Clock, Projects, Finance, Hours, Payments, Profile, Login)
- `src/api/` - API clients and request/cache utilities
- `src/state/store.js` - local auth/user state helpers

## API Integration

Frontend calls REST endpoints through `src/api/httpClient.js`.  
Base URL comes from env:

- `NEXT_PUBLIC_API_BASE_URL`
- (fallbacks also supported in code: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BACKEND_URL`)

Current local default in `.env`:

`NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`

The app expects backend endpoints such as:

- `/api/auth/*`
- `/api/projects/*`
- `/api/customers/*`
- `/api/time-entries/*`
- `/api/reports/*`
- `/api/payments/*`
- `/api/expenses/*`
- `/api/bonus-and-penalties/*`
- `/api/users/*`
- `/api/tasks/*`

## Local Development

1. Install dependencies

```bash
npm install
```

2. Configure env (already present in this repo)

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

3. Start dev server

```bash
npm run dev
```

4. Open:

- `http://localhost:3000`

## NPM Scripts

- `npm run dev` - start local development server
- `npm run build` - production build
- `npm run start` - run production server

## Portfolio Context

This project is intentionally demo-friendly and optimized for showcasing:

- end-to-end admin + user flows
- role-based UI access control
- real operational modules (hours, payments, projects, finance)
- async data loading states, toasts, modal workflows, and soft-delete patterns

If you share this publicly, consider replacing demo credentials and API URLs with deployment-specific values.
