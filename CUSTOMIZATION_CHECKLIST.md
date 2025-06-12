# 🔧 テンプレート個人化チェックリスト

新しいプロジェクトでテンプレートを使用する際に、以下の項目を変更してください。

## ✅ 必須変更項目

### 📦 package.json
- [ ] `"name": "your-project-name"` - プロジェクト名
- [ ] `"description": "プロジェクトの説明"` - プロジェクトの説明
- [ ] `"author": "あなたの名前 <your.email@example.com>"` - 作者情報
- [ ] `"repository": { "url": "https://github.com/yourusername/your-repo.git" }` - GitHubリポジトリURL
- [ ] `"bugs": { "url": "https://github.com/yourusername/your-repo/issues" }` - Issues URL
- [ ] `"homepage": "https://github.com/yourusername/your-repo#readme"` - ホームページURL

### 🦀 src-tauri/Cargo.toml
- [ ] `name = "your-project-name"` - プロジェクト名
- [ ] `description = "アプリの説明"` - アプリの説明
- [ ] `authors = ["あなたの名前 <your.email@example.com>"]` - 作者情報

### ⚙️ src-tauri/tauri.conf.json
- [ ] `"productName": "あなたのアプリ名"` - アプリ表示名
- [ ] `"identifier": "com.yourcompany.yourapp"` - アプリ識別子

### 📜 LICENSE
- [ ] `Copyright (c) 2024 [あなたの名前]` - 著作権者名

## 🎯 オプション変更項目

### 📖 README.md
- [ ] GitHubユーザー名の置換（`yourusername` → 実際のユーザー名）
- [ ] リポジトリ名の置換（必要に応じて）

### 📋 TEMPLATE_SETUP.md
- [ ] 例示用のURL更新（実際のリポジトリ情報に合わせて）

## 🗂️ Gitリポジトリの初期化

```bash
# 既存のGit履歴を削除
Remove-Item -Recurse -Force .git

# 新しいリポジトリとして初期化
git init
git add .
git commit -m "Initial commit from template"

# リモートリポジトリを追加
git remote add origin https://github.com/yourusername/your-project-name.git
git branch -M main
git push -u origin main
```

## 🔧 カスタマイズ例

### プロジェクト名の例
- `my-audio-synthesizer`
- `visual-music-app`
- `audio-visualizer-pro`

### 識別子の例
- `com.yourname.audiosynthesizer`
- `com.yourcompany.visualmusicapp`
- `com.studio.audiovisualizerpro`

### 作者情報の例
- `"author": "田中太郎 <tanaka@example.com>"`
- `"author": "AudioStudio Inc. <contact@audiostudio.com>"`

## ⚠️ 注意事項

1. **識別子は一意である必要があります** - 逆ドメイン形式で他と重複しないものを選択
2. **プロジェクト名は小文字とハイフンを使用** - npm/Cargoの命名規則に従う
3. **GitHubリポジトリは事前に作成** - 実際に存在するリポジトリURLを指定
4. **ライセンス年度は適切に設定** - 現在の年または開発開始年

## 🎉 完了後の確認

- [ ] `npm install` が正常に実行される
- [ ] `npm run dev-with-faust` でアプリが起動する
- [ ] GitHubリポジトリへのプッシュが成功する
- [ ] パッケージ情報が正しく表示される
