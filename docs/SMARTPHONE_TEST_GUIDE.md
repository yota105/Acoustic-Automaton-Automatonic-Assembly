# スマホへのテスト送信ガイド

## 📱 概要

コントローラー画面からスマホ（Player画面）にリアルタイムでメッセージを送信できます！

---

## 🚀 クイックスタート

### 1. 開発サーバー起動

```bash
# BroadcastChannel + WebSocketリレーを同時起動
npm run dev:full

# もしくは別々に起動
npm run ws-relay   # WebSocket リレー (ポート1421)
npm run dev        # Vite開発サーバー (ポート1420)
```

### 2. コントローラーを開く

```
http://localhost:1420/
```

### 3. スマホでPlayer画面を開く

同じWi-Fiネットワーク内で：

```
http://【IPアドレス】:1420/src/player.html?player=1
```

IPアドレスは以下で確認：
```bash
./network-urls.sh
```

または `http://localhost:1420/network-urls.html`

### 4. テストUIを使用

**コントローラー画面の右下に「📱 スマホ送信テスト」パネルが表示されます。**

このパネルから：
- メッセージを入力
- 送信先（全員/Player 1/2/3）を選択
- ボタンをクリックして送信！

---

## 🎯 使用方法

### UIからの送信

#### 1. アラート送信 🔔
- スマホにアラートダイアログを表示
- 確認が必要な重要なメッセージに使用

#### 2. 通知送信 💬
- 画面上部に3秒間通知を表示
- 一時的な情報共有に使用

#### 3. キュー送信 🎯
- 画面中央に大きくメッセージを表示
- 演奏のキューや指示に使用

#### 4. カウントダウン ⏱️
- 4小節のカウントダウンを表示
- エントリーのタイミング指示に使用

#### 5. カスタムメッセージ ⚡
- 自由形式のデータを送信
- 開発・デバッグ用

---

### コンソールからの送信

ブラウザの開発者ツール（F12）のコンソールで：

```javascript
// 全員にアラート
playerMessenger.sendTestAlert('テストメッセージ', 'all');

// Player 1に通知
playerMessenger.sendTestNotification('準備してください', 3000, '1');

// Player 2にキュー
playerMessenger.sendTestCue('エントリー！', '#FF9800', '2');

// 全員にカウントダウン（4小節）
playerMessenger.sendCountdown(4, 0, 'all');

// Player 3にカスタムメッセージ
playerMessenger.sendCustomMessage({ custom: true, foo: 'bar' }, '3');
```

---

## 🔧 技術仕様

### 通信方法

ハイブリッドメッセージング
- **BroadcastChannel API**: 同一オリジン内で超低遅延通信
- **WebSocketリレー**: 異なるデバイス/オリジンでも確実に届ける
- 自動重複排除＆フォールバック（両方に送信して最初に届いた方を採用）

### メッセージ形式

```typescript
{
    id: 'uuid',      // 重複防止のための一意ID
    type: 'test-alert' | 'test-notification' | 'test-cue' | ...,
    target: 'all' | '1' | '2' | '3' | 'controller',  // 送信先
    data: {
        message: 'メッセージ内容',
        // その他のデータ
    },
    timestamp: 1234567890,
    transport: 'broadcast' | 'websocket',
    source: 'controller' | 'player'
}
```

### WebSocketリレーサーバー

- スクリプト: `tools/websocket-relay.mjs`
- 起動: `npm run ws-relay`
- ポート: `1421`（環境変数 `PERFORMANCE_WS_PORT` で変更可能）
- パス: `/performance`（環境変数 `PERFORMANCE_WS_PATH` で変更可能）
- 役割: 受信したメッセージを他クライアントへ中継（送信元には再送しない）

### 対応メッセージタイプ

| タイプ | 説明 | Player側の表示 |
|--------|------|----------------|
| `test-alert` | アラート | ダイアログ表示 |
| `test-notification` | 通知 | 上部に3秒間表示 |
| `test-cue` | キュー | 中央に大きく3秒間表示 |
| `countdown` | カウントダウン | 円形ゲージで表示 |
| `custom` | カスタム | 通知として表示 |

---

## 📂 ファイル構成

### 新規作成
1. **`src/simpleMessageSender.ts`** - メッセージ送信システム
   - 送信関数
   - テストUI作成
   - グローバルAPI公開

### 更新
2. **`src/player.ts`** - Player画面の受信処理
   - ターゲット判定
   - 新メッセージタイプ対応
   - `showNotification()` 関数追加
   - `showCueMessage()` 関数追加

3. **`src/controller.ts`** - テストUIの初期化
   - `createSimpleTestUI()` 呼び出し

---

## 💡 使用例

### 例1: リハーサルでの準備指示

```javascript
// 全員に準備を促す
playerMessenger.sendTestNotification('3分後に開始します', 5000, 'all');

// 1分前
playerMessenger.sendTestCue('1分前！', '#FF9800', 'all');

// カウントダウン開始
playerMessenger.sendCountdown(4, 0, 'all');
```

### 例2: 個別指示

```javascript
// Player 1にソロの準備
playerMessenger.sendTestCue('次のセクションでソロ！', '#4CAF50', '1');

// Player 2と3は休止
playerMessenger.sendTestNotification('次のセクションは休止', 3000, '2');
playerMessenger.sendTestNotification('次のセクションは休止', 3000, '3');
```

### 例3: 緊急停止

```javascript
// 全員にアラート
playerMessenger.sendTestAlert('⚠️ 演奏を停止してください', 'all');
```

---

## 🐛 トラブルシューティング

### メッセージが届かない

**チェックリスト:**
1. [ ] WebSocketリレーが起動している？
    - `npm run dev:full` または `npm run ws-relay` を実行
    - UIステータスに「WebSocket: 接続済み」が表示されるか確認

2. [ ] コントローラーとPlayer画面が同じオリジンで開いている？
    - BroadcastChannelは同一オリジン内でのみ動作
    - **IPアクセス推奨**：`http://<PCのIP>:1420/`

3. [ ] Player画面のコンソールにエラーはない？
   - F12で開発者ツールを開いて確認

4. [ ] ネットワーク接続は正常？
   - スマホが同じWi-Fiに接続されている

5. [ ] ターゲット指定は正しい？
   - `'1'`, `'2'`, `'3'`, `'all'` のいずれか

### テストUIが表示されない

```javascript
// コンソールで手動作成
playerMessenger.createSimpleTestUI();
```

### コンソールでエラー

```javascript
// playerMessengerが未定義の場合
import { createSimpleTestUI } from './simpleMessageSender';
createSimpleTestUI();
```

---

## 🎨 カスタマイズ

### 通知の色を変更

`src/player.ts` の `showNotification()` 関数内：

```typescript
background: rgba(33, 150, 243, 0.95);  // 青
↓
background: rgba(76, 175, 80, 0.95);   // 緑
```

### キューの表示時間を変更

`src/player.ts` の `showCueMessage()` 関数内：

```typescript
setTimeout(() => {
    // ...
}, 3000);  // 3秒
↓
}, 5000);  // 5秒
```

### 独自のメッセージタイプを追加

#### 1. `src/simpleMessageSender.ts` に送信関数を追加

```typescript
export function sendMyCustomMessage(data: any, target: 'all' | string = 'all') {
    if (target === 'all') {
        return sendToAllPlayers('my-custom-type', data);
    } else {
        return sendToPlayer(target, 'my-custom-type', data);
    }
}
```

#### 2. `src/player.ts` に受信処理を追加

```typescript
case 'my-custom-type':
    // 独自の処理
    console.log('My custom message:', data);
    showNotification(`カスタム: ${data?.message}`, 3000);
    break;
```

---

## 📚 API リファレンス

### sendToAllPlayers(type, data)
全Playerにメッセージを送信

```typescript
sendToAllPlayers('test-notification', { 
    message: 'こんにちは', 
    duration: 3000 
});
```

### sendToPlayer(playerId, type, data)
特定のPlayerにメッセージを送信

```typescript
sendToPlayer('1', 'test-cue', { 
    message: 'ソロ開始！', 
    color: '#4CAF50' 
});
```

### sendTestAlert(message, target)
アラートを送信

```typescript
sendTestAlert('重要なメッセージ', 'all');
```

### sendTestNotification(message, duration, target)
通知を送信

```typescript
sendTestNotification('3秒表示される通知', 3000, '2');
```

### sendTestCue(message, color, target)
キューを送信

```typescript
sendTestCue('エントリー！', '#FF9800', '1');
```

### sendCountdown(bars, beats, target)
カウントダウンを送信

```typescript
sendCountdown(4, 0, 'all');  // 4小節
```

---

## 🎉 まとめ

✅ コントローラーからスマホにリアルタイム送信可能  
✅ UIとコンソール両方から使える  
✅ 全員または個別に送信可能  
✅ 5種類のメッセージタイプ  
✅ カスタマイズ・拡張可能  

**これで、テストボタンの結果をスマホに送信できます！**

---

## 🔗 関連ドキュメント

- `NETWORK_SETUP_COMPLETE.md` - ネットワーク接続ガイド
- `docs/PERFORMER_TARGETING_GUIDE.md` - 奏者別指示システム
- `src/simpleMessageSender.ts` - ソースコード
- `src/player.ts` - Player側の実装
