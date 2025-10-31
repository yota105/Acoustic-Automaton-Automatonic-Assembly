# さくらVPS セットアップガイド

## VPS情報
- **IPアドレス**: 160.16.107.210
- **ホスト名**: tk2-229-24456.vs.sakura.ne.jp

## 初回セットアップ手順

### 1. VPSにSSH接続
```powershell
ssh ユーザー名@160.16.107.210
```
または
```powershell
ssh ユーザー名@tk2-229-24456.vs.sakura.ne.jp
```

### 2. VPS上で環境を準備

#### Node.jsのインストール
```bash
# Node.js 20.x をインストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# バージョン確認
node --version
npm --version
```

#### nginxのインストール
```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### PM2のインストール（プロセス管理ツール）
```bash
sudo npm install -g pm2
```

#### 作業ディレクトリの作成
```bash
cd /var/www
sudo mkdir -p acoustic-automaton
sudo chown $USER:$USER acoustic-automaton
cd acoustic-automaton

# 必要なサブディレクトリを作成
mkdir -p dist tools
```

### 3. nginx設定

#### nginx設定ファイルを作成
```bash
sudo nano /etc/nginx/sites-available/acoustic-automaton
```

以下の内容を貼り付け：

```nginx
server {
    listen 80;
    server_name 160.16.107.210 tk2-229-24456.vs.sakura.ne.jp;

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
        proxy_read_timeout 86400;
    }

    # オーディオファイル
    location /audio/ {
        root /var/www/acoustic-automaton/dist;
        add_header Access-Control-Allow-Origin *;
    }
}
```

#### nginx設定を有効化
```bash
sudo ln -s /etc/nginx/sites-available/acoustic-automaton /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### ファイアウォール設定（必要な場合）
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

### 4. ローカルからファイルをアップロード

#### PowerShellスクリプトを編集
`upload-sakura.ps1` を開き、ユーザー名を設定：
```powershell
$VPS_USER = "実際のユーザー名"  # さくらVPSのユーザー名に変更
```

#### アップロード実行
```powershell
.\upload-sakura.ps1
```

### 5. VPS上で動作確認

```bash
# WebSocketリレーのログを確認
pm2 logs ws-relay

# nginxの状態確認
sudo systemctl status nginx

# プロセス確認
pm2 list
```

## アクセス方法

### コントローラー
- http://160.16.107.210/src/controller.html
- http://tk2-229-24456.vs.sakura.ne.jp/src/controller.html

### プレイヤー
- Player 1: http://160.16.107.210/src/player.html?player=1
- Player 2: http://160.16.107.210/src/player.html?player=2
- Player 3: http://160.16.107.210/src/player.html?player=3

### ビジュアライザー
- http://160.16.107.210/src/visualizer.html

### WebSocket
- ws://160.16.107.210/performance

## 更新方法

### 方法1: ローカルからアップロード
```powershell
.\upload-sakura.ps1
```

### 方法2: VPS上でGitから更新
```bash
ssh ユーザー名@160.16.107.210
cd /var/www/acoustic-automaton
git pull origin feature/work-architecture
npm install
npm run build
pm2 restart ws-relay
```

## トラブルシューティング

### WebSocketに接続できない
```bash
# PM2のログを確認
pm2 logs ws-relay

# ポート1421が使用されているか確認
sudo netstat -tulpn | grep 1421

# WebSocketリレーを再起動
pm2 restart ws-relay
```

### nginxエラー
```bash
# エラーログを確認
sudo tail -f /var/log/nginx/error.log

# 設定をテスト
sudo nginx -t

# nginxを再起動
sudo systemctl restart nginx
```

### ファイルが表示されない
```bash
# ディレクトリのパーミッションを確認
ls -la /var/www/acoustic-automaton/dist/

# 必要に応じて修正
sudo chown -R $USER:$USER /var/www/acoustic-automaton
```

## SSH鍵認証の設定（推奨）

パスワード入力を省略するため、SSH鍵認証を設定することを推奨します。

### Windows PowerShellから
```powershell
# SSH鍵を生成（既にある場合はスキップ）
ssh-keygen -t ed25519 -C "your_email@example.com"

# 公開鍵をVPSにコピー
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ユーザー名@160.16.107.210 "cat >> ~/.ssh/authorized_keys"
```

これで次回からパスワード入力なしでSSH接続できます。
