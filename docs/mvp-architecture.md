# MVP Architecture

## Product direction

単一ユーザー向けに素早く使い始められることを優先しつつ、構造は最初からSaaS化に耐えるようにします。

- 認証主体は今は1ユーザー
- データモデル上は `workspace` を持つ
- `x_account` は将来複数件に増やせる前提

## Functional scope

### 1. 投稿

- 下書き作成
- 予約投稿
- 承認が必要な場合は `awaiting_approval`
- 自動投稿ONならスケジュール到達で実行

### 2. 返信

- メンションや対象ポストを取り込む
- 返信候補を生成する
- 承認設定に応じて即送信または承認待ちに入れる

### 3. 分析

- 日次でインプレッション、エンゲージメント、フォロワー増減を保存
- ダッシュボードで推移を表示

### 4. 下書き生成

- テーマ、口調、CTAを指定して候補文面を生成
- 生成物は必ず `content_job` として保存

## Recommended initial database tables

- `workspaces`
- `users`
- `x_accounts`
- `automation_policies`
- `content_jobs`
- `content_approvals`
- `mentions`
- `reply_suggestions`
- `analytics_snapshots`

## Key backend flows

### Publish flow

1. 管理画面で投稿を作る
2. APIが `content_jobs` に保存する
3. 承認必須なら `awaiting_approval`
4. 自動ならキュー投入
5. worker が X API に送信
6. 結果を保存

### Reply flow

1. メンション取得
2. 返信候補生成
3. 承認設定を評価
4. 送信または承認待ち

### Analytics flow

1. 定期ジョブがX APIから値を取得
2. 日次スナップショット保存
3. ダッシュボードで集計表示

## Suggested implementation order

1. X OAuth
2. 投稿作成と予約投稿
3. 承認ワークフロー
4. 分析取得
5. 返信候補生成
6. LLMを使った下書き生成
