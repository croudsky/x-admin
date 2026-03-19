# Contributing

## Setup

1. `cp .env.example .env`
2. `pnpm install`
3. `pnpm prisma:generate`
4. `pnpm prisma:push`
5. `pnpm prisma:seed`

## Development

- Web: `pnpm dev:web`
- API: `pnpm dev:api`
- Worker: `pnpm --filter api start:worker:dev`

## Checks

- Test: `pnpm test`
- Build: `pnpm build`

## Pull Requests

- Keep changes scoped to one concern.
- Update `docs/` when behavior changes.
- Do not commit secrets or `.env`.

