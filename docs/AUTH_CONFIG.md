# 認証設定ガイド

## 概要

`auth-config.json` ファイルを使用して、パスワード認証の有効/無効とパスワードを設定できます。

## 設定ファイルの場所

```
public/auth-config.json
```

## 設定項目

```json
{
  "authRequired": true,
  "controllerPassword": "controller2025",
  "playerPassword": "player2025"
}
```

### `authRequired` (必須)
- **型**: `boolean`
- **説明**: パスワード認証を要求するかどうかのフラグ
- **値**:
  - `true`: 認証が必要（デフォルト）
  - `false`: 認証をスキップし、自動的にPlayer権限でログイン

### `controllerPassword` (必須)
- **型**: `string`
- **説明**: Controller用のパスワード
- **デフォルト**: `"controller2025"`

### `playerPassword` (必須)
- **型**: `string`
- **説明**: Player用のパスワード
- **デフォルト**: `"player2025"`

## 使用例

### 例1: 認証を有効にする（デフォルト）

```json
{
  "authRequired": true,
  "controllerPassword": "my-secret-controller-pass",
  "playerPassword": "my-secret-player-pass"
}
```

### 例2: 認証を無効にする（開発/リハーサル時）

```json
{
  "authRequired": false,
  "controllerPassword": "",
  "playerPassword": ""
}
```

認証が無効の場合、パスワードは使用されませんが、設定ファイルには含める必要があります。

### 例3: 同じパスワードを使用する

```json
{
  "authRequired": true,
  "controllerPassword": "shared-password-2025",
  "playerPassword": "shared-password-2025"
}
```

## 注意事項

### セキュリティ

⚠️ **重要**: このパスワード認証は基本的なアクセス制御のみを提供します。

- パスワードはクライアントサイドで検証されます
- 本番環境では、サーバーサイド認証の使用を推奨します
- パスワードをGitにコミットしないように注意してください

### Git管理

`.gitignore` に以下を追加することを推奨します:

```
public/auth-config.json
```

代わりに、テンプレートファイルを用意:

```
public/auth-config.example.json
```

### 設定ファイルが見つからない場合

設定ファイルが存在しない、または読み込みに失敗した場合、以下のデフォルト値が使用されます:

```json
{
  "authRequired": true,
  "controllerPassword": "controller2025",
  "playerPassword": "player2025"
}
```

## トラブルシューティング

### 設定が反映されない

1. ブラウザのキャッシュをクリア
2. セッションストレージをクリア (開発者ツール → Application → Session Storage)
3. ページをハードリフレッシュ (Ctrl+Shift+R / Cmd+Shift+R)

### 認証をリセットしたい

ブラウザの開発者ツールで以下を実行:

```javascript
sessionStorage.clear();
location.reload();
```

## 本番環境での推奨設定

```json
{
  "authRequired": true,
  "controllerPassword": "[強力なランダムパスワード]",
  "playerPassword": "[強力なランダムパスワード]"
}
```

パスワード生成の例:
```bash
# Linuxのコマンド例
openssl rand -base64 32
```

PowerShellの例:
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | % {[char]$_})
```
