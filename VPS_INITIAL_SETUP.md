# さくらVPS 初期セットアップガイド

## VPS情報
- **IPアドレス**: 160.16.107.210
- **ホスト名**: tk2-229-24456.vs.sakura.ne.jp

---

## ステップ1: VPSの初期化（さくらコントロールパネル）

1. **さくらインターネット会員メニュー**にログイン
   - https://secure.sakura.ad.jp/vps/

2. 対象のVPSを選択

3. **OS再インストール**を実行
   - **推奨OS**: Ubuntu 22.04 LTS
   - **パッケージ**: 標準パッケージ
   - **rootパスワード**: 任意の強力なパスワードを設定（メモしておく）

4. 再インストール完了まで数分待つ

---

## ステップ2: 初回SSH接続とユーザー作成

### 2-1. rootでSSH接続
```powershell
ssh root@160.16.107.210
```

初回接続時に「The authenticity of host...」と表示されたら `yes` と入力

### 2-2. システムアップデート
```bash
apt update
apt upgrade -y
```

### 2-3. 作業用ユーザーを作成（推奨）
```bash
# ユーザー作成（yota105の部分は任意のユーザー名）
adduser yota105

# sudoグループに追加
usermod -aG sudo yota105

# SSH接続を許可
mkdir -p /home/yota105/.ssh
chmod 700 /home/yota105/.ssh

# rootの公開鍵をコピー（既に設定している場合）
cp ~/.ssh/authorized_keys /home/yota105/.ssh/ 2>/dev/null || true
chown -R yota105:yota105 /home/yota105/.ssh
```

一旦exitして、新しいユーザーで接続確認：
```bash
exit
```

```powershell
ssh yota105@160.16.107.210
```

---

## ステップ3: 必要なソフトウェアのインストール

### 3-1. Node.jsのインストール
```bash
# Node.js 20.x をインストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# バージョン確認
node --version
npm --version
```

### 3-2. nginxのインストール
```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 3-3. PM2のインストール
```bash
sudo npm install -g pm2
```

### 3-4. Gitのインストール（念のため）
```bash
sudo apt install git -y
git --version
```

---

## ステップ4: ファイアウォール設定

```bash
# UFWを有効化
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## ステップ5: アプリケーションディレクトリの準備

```bash
# ディレクトリ作成
sudo mkdir -p /var/www/acoustic-automaton
sudo chown $USER:$USER /var/www/acoustic-automaton
cd /var/www/acoustic-automaton

# 必要なサブディレクトリ
mkdir -p dist tools public/audio src
```

---

## ステップ6: nginx設定

### 6-1. 設定ファイルを作成
```bash
sudo nano /etc/nginx/sites-available/acoustic-automaton
```

以下の内容を貼り付け（Ctrl+Shift+V）：

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

    # .htaccessなどを隠す
    location ~ /\. {
        deny all;
    }
}
```

保存: Ctrl+X → Y → Enter

### 6-2. 設定を有効化
```bash
# シンボリックリンクを作成
sudo ln -sf /etc/nginx/sites-available/acoustic-automaton /etc/nginx/sites-enabled/

# デフォルト設定を無効化
sudo rm -f /etc/nginx/sites-enabled/default

# 設定テスト
sudo nginx -t

# nginx再起動
sudo systemctl reload nginx
```

---

## ステップ7: ローカルからファイルをアップロード

### 7-1. ローカル（Windows）でビルド
```powershell
cd "D:\制作用\音響的オートマトン オートマトン的共同体\Acoustic-Automaton-Automatonic-Assembly"
npm run build
```

### 7-2. ファイルをアップロード

#### 方法A: scpコマンド（PowerShell）
```powershell
# distフォルダをアップロード
scp -r .\dist\* yota105@160.16.107.210:/var/www/acoustic-automaton/dist/

# srcフォルダをアップロード
scp -r .\src\*.html .\src\*.css yota105@160.16.107.210:/var/www/acoustic-automaton/src/

# toolsフォルダをアップロード
scp .\tools\websocket-relay.mjs yota105@160.16.107.210:/var/www/acoustic-automaton/tools/

# publicフォルダをアップロード（オーディオファイルなど）
scp -r .\public\* yota105@160.16.107.210:/var/www/acoustic-automaton/public/

# package.jsonをアップロード
scp .\package*.json yota105@160.16.107.210:/var/www/acoustic-automaton/
```

#### 方法B: PowerShellスクリプト（後述）

### 7-3. VPSで依存関係をインストール
```bash
ssh yota105@160.16.107.210
cd /var/www/acoustic-automaton
npm install --production
```

---

## ステップ8: WebSocketリレーの起動

```bash
# PM2で起動
pm2 start tools/websocket-relay.mjs --name "ws-relay"

# 自動起動設定
pm2 save
pm2 startup

# 表示されたコマンドをコピーして実行（例）:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u yota105 --hp /home/yota105

# 状態確認
pm2 list
pm2 logs ws-relay
```

---

## ステップ9: 動作確認

### ブラウザでアクセス
- http://160.16.107.210/src/controller.html
- http://160.16.107.210/src/player.html?player=1
- http://160.16.107.210/src/visualizer.html

### WebSocket接続確認
ブラウザのコンソールでエラーがないか確認

### VPS上でログ確認
```bash
# WebSocketリレーのログ
pm2 logs ws-relay

# nginxのログ
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## トラブルシューティング

### SSH接続できない
```powershell
# ホストキーをクリア
ssh-keygen -R 160.16.107.210

# 再接続
ssh root@160.16.107.210
```

### ファイルが表示されない
```bash
# パーミッション確認
ls -la /var/www/acoustic-automaton/

# 修正
sudo chown -R $USER:$USER /var/www/acoustic-automaton
chmod -R 755 /var/www/acoustic-automaton
```

### WebSocketに接続できない
```bash
# PM2の状態確認
pm2 status

# ポート確認
sudo netstat -tulpn | grep 1421

# 再起動
pm2 restart ws-relay
```

### nginx設定エラー
```bash
# 設定テスト
sudo nginx -t

# エラーログ確認
sudo tail -f /var/log/nginx/error.log
```

---

## 次のステップ

セットアップ完了後、`upload-sakura.ps1`スクリプトを使って簡単にアップデートできます。

```powershell
.\upload-sakura.ps1
```

---

## セキュリティ推奨事項

1. **SSH鍵認証の設定**（パスワード認証を無効化）
2. **fail2banのインストール**（ブルートフォース攻撃対策）
3. **定期的なシステムアップデート**
4. **SSL証明書の設定**（Let's Encrypt）

詳細は別途ご案内します。
