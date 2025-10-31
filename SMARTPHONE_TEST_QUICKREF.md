# スマホ送信 - クイックリファレンス

## 🚀 すぐ使える！

### 1. セットアップ（1回だけ）

```bash
# BroadcastChannel + WebSocketリレーを同時起動
npm run dev:full

# もしくは個別に起動
npm run ws-relay   # WebSocketリレー (1421番ポート)
npm run dev        # Vite開発サーバー (1420番ポート)
```

### 2. コントローラーを開く

```
http://localhost:1420/
```

### 3. スマホでPlayer画面を開く

```
http://【IPアドレス】:1420/src/player.html?player=1
```

IPアドレスは: `./network-urls.sh` または `http://localhost:1420/network-urls.html`

---

## 📱 送信方法

### 方法1: UIから（簡単！）

**コントローラー画面の右下に「📱 スマホ送信テスト」パネル**

1. メッセージ入力
2. 送信先選択（全員/Player 1/2/3）
3. ボタンクリック

### 方法2: コンソールから（柔軟！）

F12 → コンソールで：

```javascript
// アラート
playerMessenger.sendTestAlert('テスト', 'all');

// 通知（3秒）
playerMessenger.sendTestNotification('準備OK', 3000, '1');

// キュー（中央に大きく表示）
playerMessenger.sendTestCue('エントリー！', '#FF9800', '2');

// カウントダウン（4小節）
playerMessenger.sendCountdown(4, 0, 'all');

// カスタム
playerMessenger.sendCustomMessage({ foo: 'bar' }, '3');
```

---

## 🎯 メッセージタイプ

| ボタン/関数 | Player側の表示 | 用途 |
|------------|---------------|------|
| 🔔 アラート<br>`sendTestAlert` | ダイアログ | 重要な通知 |
| 💬 通知<br>`sendTestNotification` | 上部に3秒 | 一時的な情報 |
| 🎯 キュー<br>`sendTestCue` | 中央に大きく3秒 | 演奏指示 |
| ⏱️ カウントダウン<br>`sendCountdown` | 円形ゲージ | タイミング指示 |
| ⚡ カスタム<br>`sendCustomMessage` | 通知として表示 | 自由形式 |

---

## 🎪 送信先指定

```javascript
// 全員に送信
'all'

// 特定のPlayerに送信
'1'  // Player 1
'2'  // Player 2
'3'  // Player 3
```

---

## 💡 よくある使い方

### リハーサル開始

```javascript
playerMessenger.sendTestNotification('3分後に開始', 5000, 'all');
// 3分後
playerMessenger.sendTestCue('開始します！', '#4CAF50', 'all');
playerMessenger.sendCountdown(4, 0, 'all');
```

### 個別指示

```javascript
// Player 1にソロの準備
playerMessenger.sendTestCue('次はソロ！', '#4CAF50', '1');

// Player 2と3は待機
playerMessenger.sendTestNotification('待機', 3000, '2');
playerMessenger.sendTestNotification('待機', 3000, '3');
```

### 緊急停止

```javascript
playerMessenger.sendTestAlert('⚠️ 停止', 'all');
```

---

## 🐛 動かないときは？

### チェック項目

1. **WebSocketリレーが起動している？**
    - `npm run dev:full` または `npm run ws-relay` を実行
    - UIステータスに「WebSocket: 接続済み」と表示されるか確認

2. **同じネットワーク？**
    - スマホとPCが同じWi-Fiに接続

3. **同じURL？**
    - 全員が `http://【PCのIP】:1420` でアクセス（IP統一がおすすめ）

4. **コンソールエラー？**
    - F12で確認

### 手動でUIを再表示

```javascript
playerMessenger.createSimpleTestUI();
```

---

## 🎨 カスタマイズ例

### 独自メッセージを追加

#### 送信側（controller）

```javascript
// simpleMessageSender.tsに追加
export function sendMyMessage(data, target = 'all') {
    if (target === 'all') {
        return sendToAllPlayers('my-type', data);
    } else {
        return sendToPlayer(target, 'my-type', data);
    }
}
```

#### 受信側（player）

```typescript
// player.tsのswitch文に追加
case 'my-type':
    console.log('My message:', data);
    showNotification(`受信: ${data?.message}`, 3000);
    break;
```

---

## 📚 詳細ドキュメント

- `docs/SMARTPHONE_TEST_GUIDE.md` - 完全ガイド
- `NETWORK_SETUP_COMPLETE.md` - ネットワーク設定
- `src/simpleMessageSender.ts` - ソースコード

---

## ✨ まとめ

```javascript
// すぐ試せる！
playerMessenger.sendTestAlert('テスト成功！', 'all');
```

**コントローラー右下のUIから、または上記コマンドをコンソールで実行！**
