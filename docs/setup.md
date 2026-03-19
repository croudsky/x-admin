# Setup

## Local

1. `cp .env.example .env`
2. `.env` の `ENCRYPTION_KEY` を十分長いランダム文字列に変更
3. 必要なら `.env` の `SAFETY_BLOCKLIST` に禁止語をカンマ区切りで追加
4. `pnpm install`
5. `pnpm prisma:generate`
6. `pnpm prisma:push`
7. `pnpm prisma:seed`
8. `pnpm dev:api`
9. `pnpm dev:web`
10. 別ターミナルで `pnpm --filter api start:worker:dev`
11. 必要なら管理画面で `通知設定` に webhook URL を登録

## Docker

1. `cp .env.example .env`
2. `.env` の `ENCRYPTION_KEY` を本番相当の安全な値に変更
3. 必要なら `.env` の `SAFETY_BLOCKLIST` に禁止語を設定
4. `docker compose up --build`
5. Web: `http://localhost:3000`
6. API health: `http://localhost:4000/health`
7. Worker: `docker compose logs worker`
8. 必要なら管理画面で `通知設定` に webhook URL を登録

## Prisma

- generate: `pnpm prisma:generate`
- schema push: `pnpm prisma:push`
- seed: `pnpm prisma:seed`
- studio: `pnpm prisma:studio`

## Test and Build

- test: `pnpm test`
- build: `pnpm build`
