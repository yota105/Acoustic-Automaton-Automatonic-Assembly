# SSHキーのセットアップガイド

## Windows PowerShellでSSHキーを生成・登録する

### ステップ1: SSHキーを生成

```powershell
# SSHキーを生成（既にある場合はスキップ）
ssh-keygen -t ed25519 -C "your_email@example.com"
```

実行すると以下のように聞かれます：
```
Enter file in which to save the key (C:\Users\YourName/.ssh/id_ed25519):
```
→ **Enterキーを押す**（デフォルトの場所に保存）

```
Enter passphrase (empty for no passphrase):
```
→ **パスフレーズを入力**（推奨）または空のままEnter

### ステップ2: 公開鍵の内容を確認

```powershell
# 公開鍵の内容を表示
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

または

```powershell
# クリップボードにコピー
type $env:USERPROFILE\.ssh\id_ed25519.pub | clip
```

表示される内容（例）:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your_email@example.com
```

この**全文をコピー**してください。

---

## さくらVPSへのSSHキー登録方法

### 方法A: OS再インストール時に登録（推奨）

1. **さくらインターネット会員メニュー**にログイン
   - https://secure.sakura.ad.jp/vps/

2. 対象のVPSを選択

3. **OS再インストール**をクリック

4. 設定画面：
   - **OS**: Ubuntu 22.04 LTS を選択
   - **パッケージ**: 標準パッケージ
   - **rootパスワード**: 任意のパスワードを入力
   - **公開鍵認証**: 
     - 「公開鍵を登録する」にチェック ✅
     - コピーした公開鍵（ssh-ed25519 AAA...）を貼り付け

5. **確認**→**実行**

これで、SSHキーでログインできるようになります。

---

### 方法B: OS再インストール後に手動で登録

OS再インストール時に登録しなかった場合、後から追加できます。

#### B-1. パスワードでSSH接続
```powershell
ssh root@160.16.107.210
```

#### B-2. SSHキーを登録
```bash
# .sshディレクトリを作成
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# authorized_keysファイルを編集
nano ~/.ssh/authorized_keys
```

コピーした公開鍵を貼り付けて保存：
- Ctrl+Shift+V（貼り付け）
- Ctrl+X → Y → Enter（保存して終了）

```bash
# パーミッションを設定
chmod 600 ~/.ssh/authorized_keys

# SSH設定を確認（公開鍵認証が有効か）
sudo nano /etc/ssh/sshd_config
```

以下の行を確認（コメントアウトされていないこと）:
```
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

SSHサービスを再起動：
```bash
sudo systemctl restart ssh
```

#### B-3. 接続テスト
新しいターミナルで（既存の接続は残したまま）:
```powershell
ssh root@160.16.107.210
```

パスワードを聞かれずに接続できればOK！

---

### 方法C: さくらのコントロールパネルから後で追加

1. **さくらインターネット会員メニュー**にログイン

2. 対象のVPSを選択

3. **設定** → **SSHキー管理**（または類似の項目）

4. 公開鍵を登録

※ メニュー構成はさくらのバージョンにより異なる場合があります

---

## 作業ユーザー(yota105)にもSSHキーを設定

rootでSSHキーが使えるようになったら、作業ユーザーにも設定します。

```bash
# rootでログイン
ssh root@160.16.107.210

# 作業ユーザーを作成（未作成の場合）
adduser yota105
usermod -aG sudo yota105

# 公開鍵をコピー
mkdir -p /home/yota105/.ssh
cp ~/.ssh/authorized_keys /home/yota105/.ssh/
chown -R yota105:yota105 /home/yota105/.ssh
chmod 700 /home/yota105/.ssh
chmod 600 /home/yota105/.ssh/authorized_keys
```

テスト：
```powershell
ssh yota105@160.16.107.210
```

---

## SSHキーでログインできない場合のトラブルシューティング

### 1. 詳細モードで接続してエラーを確認
```powershell
ssh -v yota105@160.16.107.210
```

### 2. ホストキーをクリア
```powershell
ssh-keygen -R 160.16.107.210
```

### 3. パーミッションを確認（VPS側）
```bash
ls -la ~/.ssh/
# authorized_keys が 600 であることを確認
```

### 4. SSH設定を確認（VPS側）
```bash
sudo tail -f /var/log/auth.log
```

別のターミナルで接続を試み、ログを確認

### 5. SELinuxが有効な場合（CentOSなど）
```bash
restorecon -R -v ~/.ssh
```

---

## WindowsでSSH Agentを使う（パスフレーズを毎回入力しない）

### 1. SSH Agentを起動
```powershell
# 管理者権限でPowerShellを開く
Start-Service ssh-agent
Set-Service -Name ssh-agent -StartupType Automatic
```

### 2. SSHキーを追加
```powershell
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

パスフレーズを一度入力すれば、次回から入力不要になります。

---

## まとめ

**推奨フロー:**
1. ローカルでSSHキーを生成（`ssh-keygen`）
2. 公開鍵をコピー（`type ~/.ssh/id_ed25519.pub | clip`）
3. さくらVPSのOS再インストール時に公開鍵を登録
4. パスワードなしでSSH接続できることを確認
5. 作業ユーザーにも同じ公開鍵を設定

これで安全で便利なSSH接続が可能になります！
