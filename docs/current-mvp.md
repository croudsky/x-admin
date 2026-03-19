# Current MVP

現時点で実装済みのMVP機能をまとめます。

## 管理画面

- 接続アカウント表示
- アカウント切替
- KPI表示
- 投稿カレンダー表示
- 運用監視ダッシュボード
- コンテンツキュー表示
- 再審査キュー表示
- failed / approval 待ちジョブの本文編集
- 承認履歴表示
- 監査ログ表示
- 監査ログの event 絞り込みと検索
- Mentions一覧表示
- 固定投稿返信ルールの設定
- 固定投稿返信ルールの複製と削除
- 固定投稿返信ルールの有効化/無効化と並び替え
- X認証設定の保存
- local login と workspace user 管理
- session ベースの API 認可
- session user の workspace に閉じた API スコープ
- role ごとの API 制御
- role ごとの UI 出し分け
- Billing / Usage summary 表示
- plan と usage limit の設定
- AIプロバイダ設定の保存
- 通知 webhook 設定の保存
- Slack / Discord / Generic preset
- テスト通知送信
- 再通知間隔と失敗しきい値の設定
- Prompt Templates の編集
- Prompt Preview の表示

## 投稿と返信

- 手動で投稿ジョブを作成
- AIで投稿下書きを生成
- AIで返信下書きを生成
- mention から返信下書きを生成
- 固定投稿への返信を条件一致時に自動で返信ジョブ化
- 自動返信の一時停止、時間/日次/スパイク上限の設定
- 過去投稿の分析
- 競合アカウントの投稿分析
- 分析履歴の保存
- learning profile の prompt 反映
- 投稿別パフォーマンス表示
- 送信前の safety validation
- 承認
- 差し戻し
- 承認コメント付きの一括承認 / 一括差し戻し
- failed job の `再審査へ戻す`
- failed / draft job の `再投入`
- failed / draft / awaiting_approval job の本文編集
- 月/週カレンダーから予約日を選択
- stuck job の手動解除
- 手動 dispatch 実行
- queued / scheduled ジョブのX送信
- due job の自動送信
- mention の定期同期

## X連携

- OAuth 2.0 PKCE の接続URL生成
- callback で token exchange
- refresh token による access token 更新
- `users/me` 取得と `x_accounts` 更新
- mentions endpoint から mention 同期
- `GET /2/tweets/:id/liking_users` で固定投稿へのいいね判定
- `GET /2/tweets/:id/retweeted_by` で固定投稿へのリポスト判定
- `GET /2/users/:id/following` でフォロー済み判定
- `POST /2/tweets` で投稿/返信送信
- `GET /2/tweets` で投稿メトリクス取得
- `GET /2/users/:id` で follower metrics 取得
- `GET /2/users/:id/tweets` で過去投稿取得
- `GET /2/users/by/username/:username` で競合アカウント取得

## AI連携

- OpenAI
- Claude
- Gemini

現状は管理画面に保存した `API Key` と `Model` を使って生成します。

保存した `API Key` と `Client Secret` はアプリ層で暗号化してDB保存します。

## Workspace Users

- local login endpoint
- `owner / admin / editor / reviewer / viewer` role
- workspace user の追加
- role 更新
- `owner / admin` のみ user 管理と重要設定変更が可能
- `editor / reviewer / viewer` は用途に応じて API 権限を制限

## Billing / Usage

- `free / pro / agency` の plan tier
- 月額、接続可能 X アカウント数、月間ジョブ上限、月間 AI 生成上限、月間 mention 同期上限を設定可能
- 現在 period の usage summary を表示
- `content job 作成` `AI生成` `mention同期` に usage limit を適用

## Worker / Scheduler

- worker サービスを Docker Compose で分離
- 15秒ごとに due job を dispatch
- 30秒ごとに mentions を同期
- 30分ごとに analytics snapshot を収集
- 送信失敗時は backoff 付きで retry
- safety validation に引っかかった job は `awaiting_approval` に戻す
- 通知イベントを webhook に送信
- 認証設定、承認、送信、retry を audit log に保存

## Prompt管理

- `base`
- `task_post`
- `task_reply`
- `safety`

投稿生成や返信生成では、これらを合成して最終 prompt を作ります。

分析済みアカウントでは、`learning profile` を prompt に差し込んで生成方針を寄せます。

## 固定投稿返信ルール

- 固定ツイートIDと固定ツイート内容を管理画面から保存
- 条件は `必須文言` `いいね必須` `リポスト必須` の組み合わせで設定
- `フォロー必須` `有効期間` `同一ユーザーへの1日上限` `除外ユーザーID` `優先度` を設定可能
- 条件一致時は reply job を自動作成
- reply template では `{{author_handle}}` と `{{author_id}}` を使用可能

## 自動返信制御

- 自動返信の手動停止
- クールダウン終了時刻
- 1時間上限
- 1日上限
- 10分スパイク上限
- 連続自動返信上限

## Mention同期

- `XSyncState` で `lastMentionId` と `nextPaginationToken` を保持
- 1回の同期で最大3ページまで追従
- rate limit 時は `rateLimitedUntil` を保存して次回同期を抑制
