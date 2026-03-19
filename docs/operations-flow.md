# Operations Flow

## 初回セットアップ

1. `.env` を作成
2. `pnpm install`
3. `pnpm prisma:generate`
4. `pnpm prisma:push`
5. `pnpm prisma:seed`
6. `docker compose up --build`

seed 後の初期 local user:

- email: `owner@oku.local`
- password: `oku-demo-password`

API は `Authorization: Bearer <session-token>` が必須です。
ログイン後の API は、session user が所属する workspace のデータだけを参照します。
UI も role に応じて操作可能な機能だけ表示します。

`docker compose` では `web / api / worker / db` が起動します。

## X接続

1. 管理画面で `X認証設定` を保存
2. `Xアカウントを接続` を押す
3. XのOAuth認可を完了する
4. callback 後に `x_accounts` が更新される
5. access token の期限が近い場合は API 実行時に refresh token で自動更新する
6. 複数アカウントを接続した場合は画面上部で切り替える

## AI設定

1. 管理画面で `AIプロバイダ設定` を保存
2. 必要なら `Prompt Templates` を編集
3. `投稿用 preview` / `返信用 preview` で prompt を確認

## 通知設定

1. 管理画面で `通知設定` に webhook URL を保存
2. `Slack` / `Discord` / `Generic Webhook` の preset を選べる
3. `content.failed`, `content.published`, `approval.approved` などの event を設定する
4. `再通知間隔` と `失敗通知しきい値` を設定できる
5. `テスト通知を送信` で webhook を確認できる
6. 対象イベントが発生すると webhook に通知される

## Billing / Usage

1. `owner / admin` は `Billing / Usage` で plan と usage limit を設定できる
2. 月間ジョブ数、AI生成回数、mention同期回数を確認できる
3. 上限に達すると `投稿作成` `AI生成` `mention同期` は API 側で拒否される

## 投稿運用

1. 手動作成または `AI投稿生成`
2. `投稿カレンダー` の月/週ビューで予約済みジョブを確認できる
3. カレンダーの日付を押すと新規ジョブの予約欄に時刻が入る
4. safety validation に引っかかった場合は `awaiting_approval` に戻る
5. 承認待ちなら `承認`
6. `queued` または `scheduled` になったら worker が自動送信
7. `failed` や `awaiting_approval` のジョブは本文と予約時刻を編集できる
8. `failed` になった場合は `再審査へ戻す` または `再投入`
9. 必要なら管理画面から `Xへ送信` で即時送信

## 返信運用

1. worker が定期的に `mentions` を同期
2. 固定投稿返信ルールを設定している場合は、`固定ツイートID` `必須文言` `いいね` `リポスト` `フォロー` `有効期間` `同一ユーザー上限` `除外ユーザーID` を満たした mention から自動で reply job を作成する
3. reply template では `{{author_handle}}` と `{{author_id}}` を使える
4. 自動返信ポリシーで `一時停止` `1時間上限` `1日上限` `10分スパイク上限` `連続自動返信上限` を制御する
5. 固定返信ルールは `有効化/無効化` `複製` `削除` `優先度の並び替え` ができる
6. それ以外の mention は Mentions 一覧から `reply下書きを作成`
7. safety validation に引っかかった場合は `awaiting_approval` に戻る
8. 必要なら単体承認、またはコメント付きで一括承認 / 一括差し戻しを行う
9. `queued` になったら worker が自動送信
10. `failed` や `awaiting_approval` のジョブは本文を編集できる
11. `failed` になった場合は `再審査へ戻す` または `再投入`
12. 必要なら管理画面から `Xへ送信` で即時送信

## 分析運用

1. worker が30分ごとに `analytics` を収集
2. 管理画面の `実データを取得` でも即時更新できる
3. 当日公開済みの post metrics と current followers を日次 snapshot に集約する
4. `自分の過去投稿を分析` で直近投稿の傾向を集計する
5. `競合を分析` で指定ハンドルの投稿傾向と上位投稿を比較する
6. `投稿別パフォーマンス` で published job ごとの impressions / engagements / source prompt を確認できる
7. 分析結果は履歴として保存される
8. 自分アカウントの分析結果は learning profile に更新され、次回の AI 生成 prompt に反映される

## 現時点の注意

- scheduler は単純な cron 実行ではなく、job claim 後に `processing` へ遷移して送信する
- mention 同期は cursor と pagination token を保持し、rate limit 中は `rateLimitedUntil` まで再取得を抑制する
- 通知は webhook 方式で、Slack / Discord は preset による初期値補助
- API Key や Client Secret はアプリ層で暗号化してDB保存する
- safety blocklist は `.env` の `SAFETY_BLOCKLIST` で追加できる
- 認可は `owner / admin / editor / reviewer / viewer` の role で制御される
- usage limit は workspace 単位で月次集計する

## 運用監視

1. `運用監視` セクションで queue depth、承認待ち数、stuck processing、recent failed を確認する
2. `手動 dispatch` で due job を即時実行できる
3. `stuck jobs` は `解除` ボタンで `queued` / `scheduled` に戻せる
4. mention 同期状態として `last sync` `rate limited until` `last mention id` を確認できる
