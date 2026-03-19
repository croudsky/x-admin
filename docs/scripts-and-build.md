# Scripts And Build

このリポジトリは `Vite` ではなく、`Next.js` と `Nest.js` の標準 build を使っています。

## Build

- ルート: `pnpm build`
  - 実体は `pnpm -r build`
- Web: `next build`
  - [apps/web/package.json](/Users/atsushi.kataoka/src/oku/apps/web/package.json)
- API: `nest build`
  - [apps/api/package.json](/Users/atsushi.kataoka/src/oku/apps/api/package.json)

## Run

- Web 開発: `pnpm dev:web`
  - 実体は `pnpm --filter web dev`
  - `next dev -H 0.0.0.0`
- API 開発: `pnpm dev:api`
  - 実体は `pnpm --filter api start:dev`
  - `nest start --watch`
- Worker 開発: `pnpm --filter api start:worker:dev`
  - `RUN_WORKER=true nest start --watch`
- Docker 起動: `pnpm docker:up`
  - `docker compose up --build`
- Docker 停止: `pnpm docker:down`
  - `docker compose down`

## Test

- ルートテスト: `pnpm test`
  - `vitest run`

## Prisma

- generate: `pnpm prisma:generate`
- schema push: `pnpm prisma:push`
- seed: `pnpm prisma:seed`
- studio: `pnpm prisma:studio`

## Notes

- フロントエンドは `Next.js App Router` です
- API は `Nest CLI` の build を使います
- 単体の bundler として `Vite` は採用していません
