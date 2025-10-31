# 認証システム実装ドキュメント

## 概要

Acoustic Automaton パフォーマンスシステムにセッションベースの認証機能を追加しました。

## 機能

### 1. パスワード認証
- **初回アクセス時**: `index.html` でパスワード入力を要求
- **認証成功後**: セッション中は再認証不要
- **対象ページ**: Controller, Performance, Player (1-3), Visualizer

### 2. セッション管理
- **保存場所**: `sessionStorage` (ブラウザタブごと)
- **有効期限**: タブを閉じるまで、またはブラウザ再起動まで
- **キー**: `acoustic-automaton-authenticated`

### 3. 認証フロー

```
[ユーザー]
    ↓
[index.html] → パスワード入力
    ↓ (認証成功)
sessionStorageに保存
    ↓
[ナビゲーション画面] → ページ選択
    ↓
[各ページ] → authGuard.ts でチェック
    ↓ (認証済み)
ページ表示
```

## ファイル構成

### 新規作成
- `src/auth/authGuard.ts`: 認証ガードモジュール

### 更新
- `index.html`: パスワード入力UI + セッション管理
- `src/controller.ts`: 認証ガード適用
- `src/performance.ts`: 認証ガード適用
- `src/player.ts`: 認証ガード適用
- `src/visualizer.ts`: 認証ガード適用

## 使用方法

### パスワード設定
現在のパスワード: `performance2025`

**本番環境では必ず変更してください！**

`index.html` の以下の行を編集:
```javascript
const CORRECT_PASSWORD = 'performance2025'; // ← ここを変更
```

### セキュリティ強化 (推奨)

1. **環境変数化**
   ```javascript
   const CORRECT_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD || 'default';
   ```

2. **サーバーサイド認証**
   - WebSocket/HTTPサーバーで認証トークンを発行
   - JWT等を使用

3. **ハッシュ化**
   ```javascript
   const passwordHash = await crypto.subtle.digest('SHA-256', 
     new TextEncoder().encode(password)
   );
   ```

## 動作確認

### 認証フロー確認
1. ブラウザで `http://localhost:5173/` にアクセス
2. パスワード入力画面が表示される
3. `performance2025` を入力して「Unlock System」をクリック
4. ナビゲーション画面が表示される
5. 任意のページ（Controller, Player等）をクリック
6. ページが直接表示される（再認証なし）

### 未認証アクセスのテスト
1. 新しいタブで直接 `http://localhost:5173/src/controller.html` にアクセス
2. 自動的に `index.html` にリダイレクトされる
3. パスワード入力が要求される

### セッション永続性のテスト
1. 認証後、Controller → Performance と移動
2. パスワード再入力は不要
3. タブを閉じて再度開く → パスワード再入力が必要

## API リファレンス

### `authGuard.ts`

#### `isAuthenticated(): boolean`
認証状態を確認

#### `applyAuthGuard(): void`
認証ガードを適用（未認証時リダイレクト）

#### `clearAuthentication(): void`
認証状態をクリア（ログアウト用）

#### `setupBeforeUnloadWarning(enabled: boolean): void`
ページ離脱確認を設定（オプション）

## トラブルシューティング

### パスワードが合っているのにログインできない
- ブラウザのキャッシュをクリア
- プライベートブラウジングモードで試す

### 認証後もリダイレクトされる
- `sessionStorage` が無効になっている可能性
- ブラウザの設定を確認

### Controllerからリンクで移動すると再認証が求められる
- リンクが相対パスになっているか確認
- `applyAuthGuard()` が各ページで呼ばれているか確認

## 今後の改善案

1. **複数デバイス対応**: WebSocketで認証状態を同期
2. **タイムアウト機能**: 一定時間操作がない場合に再認証
3. **ロール管理**: Operator/Performer で権限を分ける
4. **監査ログ**: アクセス履歴の記録
5. **2要素認証**: メールやSMS経由の確認コード

## セキュリティ注意事項

⚠️ **本実装はデモ/開発環境向けです**

本番環境では以下を実施してください:
- パスワードをハードコードしない
- HTTPS を使用
- サーバーサイド認証を実装
- レート制限を設定
- CSRFトークンを使用
- セキュリティヘッダーを追加

---

**実装日**: 2025年10月14日  
**バージョン**: 1.0.0
