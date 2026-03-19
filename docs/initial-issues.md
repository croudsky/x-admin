# Initial Issues

GitHub に最初に切ると進めやすい issue 案です。

## 1. Enforce Billing Limits On X Account Connection

- type: `enhancement`
- summary:
  X OAuth callback 時に `maxXAccounts` を超える接続を拒否する

## 2. Add True Workspace Tenant Isolation Review

- type: `security`
- summary:
  workspace 分離の抜け漏れを service / worker / analytics まで監査する

## 3. Add Role-Based UI Coverage Review

- type: `ui`
- summary:
  `owner/admin/editor/reviewer/viewer` ごとに UI 表示と導線を見直す

## 4. Add Billing Usage Tests

- type: `billing`
- summary:
  usage 集計と limit enforcement の unit/integration test を増やす

## 5. Add X Account Connection Guardrails

- type: `security`
- summary:
  OAuth 接続時の重複・上限・無効 workspace を厳密に扱う

## 6. Add Deploy Workflow

- type: `infra`
- summary:
  GitHub Actions から staging / production へ deploy する基盤を追加する

## 7. Add Dependabot / Renovate

- type: `infra`
- summary:
  依存更新の自動化を追加する

## 8. Add Release Process Documentation

- type: `docs`
- summary:
  tag、release note、migration 運用を文書化する

