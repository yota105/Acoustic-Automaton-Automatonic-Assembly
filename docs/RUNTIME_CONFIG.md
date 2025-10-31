# ランタイム設定 (runtime-config.json)

## 概要

`public/runtime-config.json` では、ブラウザ間の同期方法や通信チャネルを制御できます。認証設定 (`auth-config.json`) と同様にデプロイ後に内容を更新でき、ビルドをやり直す必要はありません。

## ファイルの場所

```
public/runtime-config.json
```

テンプレート:
```
public/runtime-config.example.json
```

## 設定項目

```json
{
  "enableLocalBroadcast": true,
  "enableRemoteSync": false,
  "websocketPort": 1421,
  "websocketPath": "/performance"
}
```

### `enableLocalBroadcast`
- **型**: `boolean`
- **説明**: 同一ブラウザ内 (同一デバイスの複数タブ) で状態を共有するための BroadcastChannel を有効にする
- **デフォルト**: `true`
- **備考**: `false` にするとタブ間の同期は行われません

### `enableRemoteSync`
- **型**: `boolean`
- **説明**: WebSocket を利用したマルチデバイス同期を有効にする
- **デフォルト**: `false`
- **備考**: `true` にするとサーバー側で WebSocket エンドポイントが用意されている場合に、別デバイス (同一 Wi-Fi 等) でも再生状態が共有されます

### `websocketPort`
- **型**: `number` (任意)
- **説明**: WebSocket サーバーのポート番号
- **デフォルト**: `1421`
- **備考**: 省略時は Vite の環境変数または既定値を使用します

### `websocketPath`
- **型**: `string` (任意)
- **説明**: WebSocket エンドポイントのパス
- **デフォルト**: `/performance`

## 代表的な設定例

### 1. 完全にスタンドアロンで使用 (初期値)
```json
{
  "enableLocalBroadcast": true,
  "enableRemoteSync": false
}
```
- 同一デバイス内のタブは同期
- 別デバイス間では共有されません

### 2. 同期を完全に無効化
```json
{
  "enableLocalBroadcast": false,
  "enableRemoteSync": false
}
```
- どのクライアントも独立した状態になります

### 3. LAN 内の複数デバイスで同期したい
```json
{
  "enableLocalBroadcast": true,
  "enableRemoteSync": true,
  "websocketPort": 1421,
  "websocketPath": "/performance"
}
```
- サーバー (PC) に WebSocket サービスを配置しておくと、同一 Wi-Fi 内の端末と同期します

## 運用上の注意

- `enableRemoteSync` を `true` にすると、サーバー側で WebSocket サーバーを提供する必要があります。このプロジェクトにはサーバー実装は含まれていません。必要に応じて Node.js や他のバックエンドで `/performance` エンドポイントを構築してください。
- 設定ファイルの変更を反映させるには、ブラウザのキャッシュをクリアするか、ハードリロード (Ctrl+Shift+R / Cmd+Shift+R) を行ってください。
- 本番環境では `runtime-config.json` を Git 管理外に置き、`runtime-config.example.json` をテンプレートとして使用することを推奨します。
