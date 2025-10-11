# 🌐 ローカルネットワーク接続 - セットアップ完了

## ✅ 完成内容

演奏者用デバイスからローカルネットワーク経由でPlayer画面にアクセスできるようになりました！

---

## 🚀 使い方

### 1. 開発サーバーを起動

```bash
npm run dev
```

ターミナルに表示される **Network** のIPアドレスをメモしてください：

```
➜  Local:   http://localhost:1420/
➜  Network: http://172.20.10.2:1420/  ← これ！
```

### 2. Network URLsページを開く

オペレーターPCのブラウザで：

**方法1: 直接アクセス**
```
http://localhost:1420/network-urls.html
```

**方法2: コントローラーからアクセス**
1. `http://localhost:1420/` を開く
2. 「🌐 Network URLs (演奏者用URL一覧)」ボタンをクリック

### 3. 演奏者にURLを共有

Network URLsページに表示されているURLを演奏者に共有します。

#### 演奏者用URL（例）

```
演奏者1: http://172.20.10.2:1420/src/player.html?player=1
演奏者2: http://172.20.10.2:1420/src/player.html?player=2
演奏者3: http://172.20.10.2:1420/src/player.html?player=3
```

**📱 QRコードで共有すると便利です！**

---

## 📂 作成されたファイル

### 1. `network-urls.html`
- 美しいUI付きのURL一覧ページ
- ワンクリックでURLをコピー可能
- QRコード生成の案内付き
- IPアドレスの手動入力にも対応

### 2. `network-urls.sh`
- ターミナルでURLを表示するスクリプト
- 実行方法: `./network-urls.sh`

### 3. `docs/NETWORK_SETUP_GUIDE.md`
- 詳細なセットアップガイド
- トラブルシューティング
- システム構成図

### 4. `vite.config.ts` (更新)
- `player.html` をビルドに追加
- `host: '0.0.0.0'` でネットワークアクセス有効化（既存）

### 5. `src/controller.html` (更新)
- 「🌐 Network URLs」ボタンを追加

---

## 🎯 URL構造

### ローカル（このPC）
```
http://localhost:1420/
```

### ネットワーク（他のデバイス）
```
http://【IPアドレス】:1420/
```

### 演奏者画面（IDで識別）
```
/src/player.html?player=1  ← 演奏者1
/src/player.html?player=2  ← 演奏者2
/src/player.html?player=3  ← 演奏者3
```

---

## 🔧 技術仕様

### Vite設定

```typescript
server: {
    port: 1420,
    strictPort: true,
    host: '0.0.0.0',  // すべてのネットワークインターフェースでリッスン
}
```

### Player画面の識別

URLクエリパラメータ `?player=N` でプレイヤーIDを指定：

```javascript
// player.tsで取得
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get('player') || '1';
```

---

## 💡 使用シーン

### 1. リハーサル
- 演奏者全員が同じWi-Fiに接続
- 各自のスマートフォン/タブレットでPlayer画面を開く
- オペレーターがコントローラーから全体を制御

### 2. 本番演奏
- 安定したWi-Fiルーターを使用
- 演奏者のデバイスは充電済み＆画面スリープOFF
- 事前にQRコードを印刷しておくと便利

### 3. 開発・テスト
- 複数のブラウザウィンドウでPlayer画面を開く
- 同時に複数の演奏者視点をテスト可能

---

## 🐛 トラブルシューティング

### Player画面が表示されない

**チェックリスト:**
1. [ ] `npm run dev` が実行されている？
2. [ ] すべてのデバイスが同じWi-Fiに接続されている？
3. [ ] IPアドレスが正しい？（Wi-Fi再接続時に変わることがある）
4. [ ] ファイアウォールでポート1420が開いている？

### IPアドレスの確認

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# または
./network-urls.sh
```

### dev serverの再起動

```bash
# Ctrl+C で停止してから
npm run dev
```

---

## 📊 システム構成

```
[オペレーターPC]
     ↓
[Wi-Fiルーター] ← 同じネットワーク
     ↓
[演奏者1のスマホ] → Player 1画面
[演奏者2のタブレット] → Player 2画面  
[演奏者3のPC] → Player 3画面
```

---

## 🎉 次のステップ

1. **QRコード生成**
   - https://qr-code-generator.com/ などでURLをQRコード化
   - 演奏者がスキャンして即座にアクセス

2. **Player画面のカスタマイズ**
   - `src/player.html` と `src/player.ts` を編集
   - 各演奏者用の表示内容を実装

3. **通信の実装**
   - WebSocket や BroadcastChannel でコントローラーとPlayer間の通信
   - リアルタイムでキューやイベントを配信

4. **`composition.ts` との統合**
   - 奏者別のイベントをPlayer画面に表示
   - `getEventsForPerformer()` を活用

---

## 📚 関連ドキュメント

- `docs/NETWORK_SETUP_GUIDE.md` - 詳細なセットアップガイド
- `docs/PERFORMER_TARGETING_GUIDE.md` - 奏者別指示システム
- `docs/COMPOSITION_NOTATION_GUIDE.md` - 作品記述記法

---

## ✨ まとめ

✅ Viteサーバーがネットワークアクセスに対応  
✅ Player画面がビルドに含まれる  
✅ Network URLsページで簡単にURL確認  
✅ ワンクリックでURLコピー可能  
✅ QRコード生成の案内付き  
✅ 詳細なドキュメント完備

**これで同じネットワーク内の別デバイスから演奏者画面にアクセスできます！**

---

## 🎵 クイックスタート

```bash
# 1. サーバー起動
npm run dev

# 2. URLを確認
./network-urls.sh

# 3. ブラウザで確認
# このPC: http://localhost:1420/network-urls.html
# 演奏者: http://【IPアドレス】:1420/src/player.html?player=1
```
