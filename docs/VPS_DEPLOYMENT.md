# VPSデプロイガイド

## 概要
このドキュメントでは、Acoustic Automaton をVPSにデプロイする手順を説明します。

## 必要なもの
- VPS（Ubuntu 20.04以降推奨）
- Node.js 18以降
- nginx（リバースプロキシ用）
- ドメイン（オプション）

## 1. VPSの準備

### 1.1 Node.jsのインストール
```bash
# Node.js 20.x をインストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# バージョン確認
node --version
npm --version
```

### 1.2 nginxのインストール
```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 1.3 PM2のインストール（プロセス管理）
```bash
sudo npm install -g pm2
```

## 2. アプリケーションのデプロイ

### 2.1 リポジトリのクローン
```bash
cd /var/www
sudo mkdir -p acoustic-automaton
sudo chown $USER:$USER acoustic-automaton
cd acoustic-automaton

# GitHubからクローン
git clone https://github.com/yota105/Acoustic-Automaton-Automatonic-Assembly.git .
git checkout feature/work-architecture
```

### 2.2 依存関係のインストールとビルド
```bash
npm install
npm run build
```

### 2.3 WebSocketリレーサーバーの起動
```bash
# PM2で自動起動設定
pm2 start tools/websocket-relay.mjs --name "ws-relay"
pm2 save
pm2 startup
```

## 3. nginx設定

### 3.1 nginx設定ファイルの作成
```bash
sudo nano /etc/nginx/sites-available/acoustic-automaton
```

以下の内容を貼り付け：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # ドメインまたはIPアドレス

    # 静的ファイル（ビルド済みアプリケーション）
    location / {
        root /var/www/acoustic-automaton/dist;
        try_files $uri $uri/ /index.html;
        
        # キャッシュ設定
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # WebSocketリレー（ポート1421）
    location /performance {
        proxy_pass http://localhost:1421;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocketタイムアウト設定
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # CORS設定（必要に応じて）
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Origin, Content-Type, Accept";
}
```

### 3.2 設定の有効化
```bash
# シンボリックリンク作成
sudo ln -s /etc/nginx/sites-available/acoustic-automaton /etc/nginx/sites-enabled/

# デフォルト設定を無効化（オプション）
sudo rm /etc/nginx/sites-enabled/default

# 設定テスト
sudo nginx -t

# nginx再起動
sudo systemctl restart nginx
```

## 4. ファイアウォール設定

```bash
# HTTP/HTTPS許可
sudo ufw allow 80
sudo ufw allow 443

# SSH許可（忘れずに！）
sudo ufw allow 22

# ファイアウォール有効化
sudo ufw enable
```

## 5. SSL証明書の設定（Let's Encrypt）

```bash
# Certbotインストール
sudo apt install certbot python3-certbot-nginx -y

# SSL証明書取得
sudo certbot --nginx -d your-domain.com

# 自動更新設定
sudo certbot renew --dry-run
```

## 6. アクセスURL

デプロイ後、以下のURLでアクセス可能：

- **コントローラー**: `http://your-domain.com/src/controller.html`
- **Player 1**: `http://your-domain.com/src/player.html?player=1`
- **Player 2**: `http://your-domain.com/src/player.html?player=2`
- **Player 3**: `http://your-domain.com/src/player.html?player=3`
- **ビジュアライザー**: `http://your-domain.com/src/visualizer.html`

WebSocketは `ws://your-domain.com/performance` で接続されます。

## 7. アップデート手順

```bash
cd /var/www/acoustic-automaton

# 最新コードを取得
git pull origin feature/work-architecture

# 依存関係の更新（必要に応じて）
npm install

# ビルド
npm run build

# WebSocketリレー再起動
pm2 restart ws-relay

# nginx再起動（設定変更時のみ）
sudo systemctl restart nginx
```

## 8. 監視とログ

### PM2ログの確認
```bash
# リアルタイムログ
pm2 logs ws-relay

# ステータス確認
pm2 status

# モニタリング
pm2 monit
```

### nginxログの確認
```bash
# アクセスログ
sudo tail -f /var/log/nginx/access.log

# エラーログ
sudo tail -f /var/log/nginx/error.log
```

## トラブルシューティング

### WebSocketが接続できない
1. PM2でリレーサーバーが起動しているか確認: `pm2 status`
2. ポート1421が開いているか確認: `sudo netstat -tlnp | grep 1421`
3. nginx設定でWebSocket用のproxy_passが正しいか確認

### 静的ファイルが表示されない
1. ビルドが正常に完了しているか確認: `ls -la dist/`
2. nginxの設定でrootパスが正しいか確認
3. ファイルのパーミッション確認: `sudo chown -R www-data:www-data /var/www/acoustic-automaton/dist`

### SSL証明書エラー
1. ドメインのDNS設定が正しいか確認
2. Certbotログを確認: `sudo certbot certificates`

## 簡易デプロイスクリプト

以下のスクリプトを `deploy.sh` として保存：

```bash
#!/bin/bash
set -e

echo "🚀 Deploying Acoustic Automaton..."

# コード更新
git pull origin feature/work-architecture

# 依存関係インストール
npm install

# ビルド
npm run build

# PM2再起動
pm2 restart ws-relay || pm2 start tools/websocket-relay.mjs --name "ws-relay"

echo "✅ Deployment complete!"
echo "📱 Access URLs:"
echo "   Controller: http://$(hostname -I | awk '{print $1}')/src/controller.html"
echo "   Player 1:   http://$(hostname -I | awk '{print $1}')/src/player.html?player=1"
```

実行権限付与：
```bash
chmod +x deploy.sh
```

実行：
```bash
./deploy.sh
```
