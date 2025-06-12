# Contributing to Tauri Electronics Template / コントリビューションガイド

[English](#english) | [日本語](#日本語)

---

## English

Thank you for your interest in contributing to the Tauri Electronics Template! This guide will help you get started.

### How to Contribute

#### Reporting Issues
- Use the [GitHub Issues](https://github.com/yotayota105/tauri-electronics-template/issues) page
- Provide detailed information about the problem
- Include your operating system, Node.js version, and Rust version
- Add steps to reproduce the issue

#### Suggesting Features
- Open an issue with the "enhancement" label
- Describe the feature and its use case
- Explain how it would benefit template users

#### Contributing Code

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
   - Follow the existing code style
   - Add comments for complex logic
   - Update documentation if needed
4. **Test your changes**
   ```bash
   npm run dev-with-faust
   npm run tauri build
   ```
5. **Commit your changes**
   ```bash
   git commit -m "Add: your feature description"
   ```
6. **Push and create a Pull Request**

### Development Setup

1. **Prerequisites**
   - Node.js 16+
   - Rust
   - Tauri CLI
   - Faust (optional, for DSP development)

2. **Clone and Setup**
   ```bash
   git clone https://github.com/yotayota105/tauri-electronics-template.git
   cd tauri-electronics-template
   npm install
   ```

3. **Development Commands**
   ```bash
   # Start development server
   npm run dev-with-faust
   
   # Build for production
   npm run tauri build
   
   # Type checking
   npx tsc --noEmit
   ```

### Code Style Guidelines

- **TypeScript**: Use strict mode, prefer explicit types
- **Rust**: Follow `rustfmt` formatting
- **Documentation**: Comment complex algorithms and public APIs
- **Commit Messages**: Use conventional commits format

### Areas for Contribution

- 🎵 **Audio Processing**: Improve Faust integration, add effects
- 🎨 **Visualization**: Add new Three.js/p5.js visualizations
- 🖥️ **UI/UX**: Enhance user interface and user experience
- 📚 **Documentation**: Improve guides and examples
- 🔧 **Performance**: Optimize audio processing and rendering
- 🧪 **Testing**: Add automated tests

---

## 日本語

Tauri Electronics Templateへのコントリビューションにご興味をお持ちいただき、ありがとうございます！このガイドが開始の助けになります。

### コントリビューション方法

#### 問題の報告
- [GitHub Issues](https://github.com/yotayota105/tauri-electronics-template/issues)ページを使用
- 問題の詳細情報を提供
- OS、Node.jsバージョン、Rustバージョンを含める
- 問題を再現する手順を追加

#### 機能の提案
- "enhancement"ラベルでissueを開く
- 機能とその使用例を説明
- テンプレートユーザーにとってのメリットを説明

#### コードのコントリビューション

1. **リポジトリをフォーク**
2. **機能ブランチを作成**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **変更を加える**
   - 既存のコードスタイルに従う
   - 複雑なロジックにはコメントを追加
   - 必要に応じてドキュメントを更新
4. **変更をテスト**
   ```bash
   npm run dev-with-faust
   npm run tauri build
   ```
5. **変更をコミット**
   ```bash
   git commit -m "Add: 機能の説明"
   ```
6. **プッシュしてプルリクエストを作成**

### 開発環境セットアップ

1. **前提条件**
   - Node.js 16+
   - Rust
   - Tauri CLI
   - Faust（オプション、DSP開発用）

2. **クローンとセットアップ**
   ```bash
   git clone https://github.com/yotayota105/tauri-electronics-template.git
   cd tauri-electronics-template
   npm install
   ```

3. **開発コマンド**
   ```bash
   # 開発サーバー起動
   npm run dev-with-faust
   
   # プロダクションビルド
   npm run tauri build
   
   # 型チェック
   npx tsc --noEmit
   ```

### コードスタイルガイドライン

- **TypeScript**: strictモード使用、明示的な型を優先
- **Rust**: `rustfmt`フォーマットに従う
- **ドキュメント**: 複雑なアルゴリズムとパブリックAPIにコメント
- **コミットメッセージ**: conventional commitsフォーマットを使用

### コントリビューション領域

- 🎵 **オーディオ処理**: Faust統合の改善、エフェクト追加
- 🎨 **ビジュアライゼーション**: 新しいThree.js/p5.jsビジュアライゼーション追加
- 🖥️ **UI/UX**: ユーザーインターフェースとユーザーエクスペリエンスの向上
- 📚 **ドキュメント**: ガイドと例の改善
- 🔧 **パフォーマンス**: オーディオ処理とレンダリングの最適化
- 🧪 **テスト**: 自動テストの追加
