# Form Sampling

Mobile-first PWA for field ore sampling. See `docs/` for architecture, business rules, roadmap, UI/UX spec, tech stack, and GitHub workflow — this README only covers running the project.

## Requirements

- Node.js 24 (see `.nvmrc`)
- npm

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script                 | Purpose                             |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start the Vite dev server           |
| `npm run build`        | Type-check and build for production |
| `npm run preview`      | Preview the production build        |
| `npm run lint`         | Run ESLint                          |
| `npm run typecheck`    | Run the TypeScript compiler         |
| `npm run test`         | Run Vitest in watch mode            |
| `npm run test:run`     | Run Vitest once (CI mode)           |
| `npm run format`       | Apply Prettier formatting           |
| `npm run format:check` | Check Prettier formatting           |

## Status

Phase 1 — Project Foundation (see `docs/ROADMAP.md`). No business/domain logic is implemented yet.
