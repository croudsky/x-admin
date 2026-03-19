# Database Design

## Current choice

- Prisma ORM
- PostgreSQL as default for local Docker and future production use

## Core tables

- `workspaces`: 将来のSaaS拡張単位
- `users`: 現時点では単一ユーザーでも reviewer と owner を分離できる
- `x_accounts`: 接続アカウント情報
- `automation_policies`: 承認あり/なし、自動返信、自動投稿
- `content_jobs`: 投稿と返信を同じキューで扱う
- `content_approvals`: 承認履歴
- `mentions`: 取り込んだメンション
- `reply_suggestions`: 返信候補
- `analytics_snapshots`: 日次分析

## Modeling decisions

- `content_jobs.kind` で投稿と返信を同じ実行基盤に載せる
- `automation_policies` は `workspace` 単位で始め、将来 `xAccountId` を使ってアカウント単位ポリシーに広げる
- `reply_suggestions` は必要に応じて `content_jobs` と結び付けて、そのまま送信ジョブへ昇格させる
- トークンは現段階では平文カラムだが、本番ではKMSやアプリ層暗号化が必要
