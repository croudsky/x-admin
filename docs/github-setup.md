# GitHub Setup

GitHub 側で初回に整える設定をまとめます。

## Repository

- Name: `x-admin`
- Description:
  `X automation platform with AI drafting, approvals, analytics, and worker-based operations`
- Topics:
  - `nextjs`
  - `nestjs`
  - `prisma`
  - `postgresql`
  - `tailwindcss`
  - `x-api`
  - `automation`
  - `ai`
  - `docker`

## Branch Protection

対象ブランチ:

- `main`

推奨設定:

- Require a pull request before merging
- Require approvals: `1`
- Dismiss stale approvals when new commits are pushed
- Require review from Code Owners
- Require conversation resolution before merging
- Require status checks to pass before merging
- Required status check:
  - `test-and-build`
- Do not allow bypassing the above settings
- Restrict force pushes
- Do not allow deletions

## Actions Secrets

CI や将来の deploy で使う可能性がある値:

- `DATABASE_URL`
- `ENCRYPTION_KEY`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`

現時点の `ci.yml` は build/test のみなので、secret がなくても動く構成です。

## Environments

将来的には最低でも以下を分けます。

- `development`
- `production`

分ける理由:

- secret の混線防止
- deploy 権限の分離
- 誤 deploy 防止

## Labels

最低限このセットを作ると運用しやすいです。

- `bug`
- `enhancement`
- `docs`
- `infra`
- `security`
- `billing`
- `ui`
- `api`
- `worker`

## Projects

GitHub Projects を使うなら、最初はこれで十分です。

- `Backlog`
- `In Progress`
- `Review`
- `Done`

## Recommended Order

1. Description / topics を設定
2. Branch protection を有効化
3. Required status checks を設定
4. Labels を作成
5. Project board を作成
6. Environments / secrets を追加

