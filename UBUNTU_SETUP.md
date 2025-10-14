# Ubuntu 24.04 セットアップガイド（管理ユーザー: ubuntu）

## VPS情報
- **IPアドレス**: 160.16.107.210
- **OS**: Ubuntu 24.04 amd64
- **管理ユーザー**: ubuntu
- **SSHキー**: 登録済み (yota105)

---

## OSインストール完了後の手順

### ステップ1: SSH接続確認

```powershell
ssh ubuntu@160.16.107.210
```

初回接続時に「The authenticity of host...」と表示されたら `yes` と入力

### ステップ2: システムアップデート

```bash
sudo apt update
sudo apt upgrade -y
```

### ステップ3: 必要なソフトウェアのインストール

#### Node.js 20.x のインストール
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

#### nginxのインストール
```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

#### PM2のインストール
```bash
sudo npm install -g pm2
pm2 --version
```

### ステップ4: ファイアウォール設定

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

### ステップ5: アプリケーションディレクトリの作成

```bash
sudo mkdir -p /var/www/acoustic-automaton
sudo chown ubuntu:ubuntu /var/www/acoustic-automaton
cd /var/www/acoustic-automaton
mkdir -p dist tools public/audio src
```

### ステップ6: nginx設定

#### 設定ファイルを作成
```bash
sudo nano /etc/nginx/sites-available/acoustic-automaton
```

以下の内容を貼り付け（Ctrl+Shift+V）:

```nginx
server {
    listen 80;
    server_name 160.16.107.210 tk2-229-24456.vs.sakura.ne.jp;

    root /var/www/acoustic-automaton/dist;
    index index.html;

    # 静的ファイル
    location / {
        try_files $uri $uri/ /index.html;
    }

    # srcディレクトリ（開発用HTMLファイル）
    location /src/ {
        alias /var/www/acoustic-automaton/src/;
        try_files $uri $uri/ =404;
    }

    # publicディレクトリ（オーディオファイルなど）
    location /public/ {
        alias /var/www/acoustic-automaton/public/;
        add_header Access-Control-Allow-Origin *;
    }

    # オーディオファイル
    location /audio/ {
        alias /var/www/acoustic-automaton/public/audio/;
        add_header Access-Control-Allow-Origin *;
    }

    # WebSocketリレー
    location /performance {
        proxy_pass http://localhost:1421;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
        proxy_connect_timeout 86400;
        proxy_send_timeout 86400;
    }

    # キャッシュ設定
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 隠しファイルへのアクセス拒否
    location ~ /\. {
        deny all;
    }
}
```

保存: Ctrl+X → Y → Enter

#### 設定を有効化
```bash
sudo ln -sf /etc/nginx/sites-available/acoustic-automaton /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### ステップ7: ローカルからファイルをアップロード

ローカル（Windows PowerShell）で実行:

```powershell
# プロジェクトディレクトリに移動
cd "D:\制作用\音響的オートマトン オートマトン的共同体\Acoustic-Automaton-Automatonic-Assembly"

# ビルド
npm run build

# アップロード
.\upload-sakura.ps1
```

### ステップ8: VPSで依存関係のインストールとWebSocketリレー起動

```bash
ssh ubuntu@160.16.107.210
cd /var/www/acoustic-automaton
npm install --production
pm2 start tools/websocket-relay.mjs --name "ws-relay"
pm2 save
pm2 startup
```

最後のコマンドで表示されたコマンドをコピーして実行（例）:
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### ステップ9: 動作確認

#### ブラウザでアクセス
- Controller: http://160.16.107.210/src/controller.html
- Player 1: http://160.16.107.210/src/player.html?player=1
- Player 2: http://160.16.107.210/src/player.html?player=2
- Player 3: http://160.16.107.210/src/player.html?player=3
- Visualizer: http://160.16.107.210/src/visualizer.html

#### VPSでログ確認
```bash
# WebSocketリレーのログ
pm2 logs ws-relay

# nginxのアクセスログ
sudo tail -f /var/log/nginx/access.log

# nginxのエラーログ
sudo tail -f /var/log/nginx/error.log
```

---

## トラブルシューティング

### SSH接続できない
```powershell
# ホストキーをクリア
ssh-keygen -R 160.16.107.210

# 詳細モードで接続
ssh -v ubuntu@160.16.107.210
```

### WebSocketに接続できない
```bash
# PM2の状態確認
pm2 status

# ポート確認
sudo ss -tulpn | grep 1421

# 再起動
pm2 restart ws-relay
pm2 logs ws-relay
```

### ファイルが表示されない
```bash
# パーミッション確認
ls -la /var/www/acoustic-automaton/

# 修正
sudo chown -R ubuntu:ubuntu /var/www/acoustic-automaton
chmod -R 755 /var/www/acoustic-automaton
```

### nginx設定エラー
```bash
# 設定テスト
sudo nginx -t

# エラーログ確認
sudo tail -f /var/log/nginx/error.log

# nginx再起動
sudo systemctl restart nginx
```

---

## 更新方法

### ローカルから再アップロード
```powershell
.\upload-sakura.ps1
```

### VPS上でGitから更新
```bash
ssh ubuntu@160.16.107.210
cd /var/www/acoustic-automaton
git clone https://github.com/yota105/Acoustic-Automaton-Automatonic-Assembly.git temp
cp -r temp/* .
rm -rf temp
npm install --production
npm run build
pm2 restart ws-relay
```

---

## まとめ

1. ✅ OSインストール完了後、SSH接続
2. ✅ システムアップデートとソフトウェアインストール
3. ✅ nginx設定
4. ✅ ローカルからビルド＆アップロード
5. ✅ WebSocketリレー起動
6. ✅ ブラウザでアクセス確認

これで完了です！
