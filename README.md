# Oku

Oku is a monorepo for an X automation platform built with `Next.js`, `NestJS`, `Prisma`, and `PostgreSQL`.

It is designed for:

- scheduled posting
- AI-assisted draft generation
- mention sync and reply workflows
- approval-based publishing
- analytics collection
- multi-account ready operations
- workspace and role-based access control

## Stack

- `apps/web`: Next.js admin UI
- `apps/api`: NestJS API
- `packages/shared`: shared types
- `prisma`: Prisma schema and seed
- `docs`: project documentation
- `docker-compose.yml`: local web/api/worker/db environment

## Features

- X OAuth 2.0 PKCE integration
- OpenAI / Claude / Gemini settings
- prompt template management
- approval flow with batch review
- worker + scheduler for dispatch and mention sync
- fixed-reply rules for pinned posts
- competitor analysis and learning profile
- audit logs and notifications
- workspace user roles: `owner / admin / editor / reviewer / viewer`
- billing and usage limit groundwork

## Quick Start

1. Copy env file

```bash
cp .env.example .env
```

2. Install dependencies

```bash
pnpm install
```

3. Generate Prisma client

```bash
pnpm prisma:generate
```

4. Apply schema and seed data

```bash
pnpm prisma:push
pnpm prisma:seed
```

5. Start with Docker

```bash
docker compose up --build
```

## Local URLs

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

## Demo Login

- email: `owner@oku.local`
- password: `oku-demo-password`

## Commands

```bash
pnpm dev:web
pnpm dev:api
pnpm build
pnpm test
pnpm prisma:generate
pnpm prisma:push
pnpm prisma:seed
```

More details:

- [docs/README.md](./docs/README.md)
- [docs/setup.md](./docs/setup.md)
- [docs/current-mvp.md](./docs/current-mvp.md)
- [docs/operations-flow.md](./docs/operations-flow.md)
- [docs/scripts-and-build.md](./docs/scripts-and-build.md)

## Repository Notes

- This repository currently focuses on product and operations features first.
- Billing enforcement and workspace isolation are implemented at the application layer.
- Real X API usage requires valid app credentials and callback configuration.

## Roadmap

- stronger billing enforcement on X account connection count
- richer tenant isolation for paid workspaces
- production observability and admin tooling
- billing provider integration

