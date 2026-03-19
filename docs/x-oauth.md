# X OAuth

## Current approach

- OAuth 2.0 Authorization Code Flow with PKCE
- authorize endpoint: `https://x.com/i/oauth2/authorize`
- token endpoint: `https://api.x.com/2/oauth2/token`
- current user endpoint: `https://api.x.com/2/users/me`

## Required env vars

- `X_CLIENT_ID`
- `X_REDIRECT_URI`

## Optional env vars

- `X_CLIENT_SECRET`
- `X_OAUTH_SCOPES`

## Local callback

- `http://localhost:4000/auth/x/callback`

X Developer Portal 側には callback URL を正確一致で登録する必要があります。

## Current backend endpoints

- `GET /auth/x/connect-url`
- `GET /auth/x/callback`

## Notes

- PKCE 用の `state` と `code_verifier` は `XOAuthSession` に保存
- confidential client の場合は `Authorization: Basic ...` で token exchange
- public client の場合は request body に `client_id` を含める

## Reference

- X official docs:
  https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
