# Acoustic Automaton Automatonic Assembly

[日本語](#日本語) | [English](#english)

---

## English

A professional audio-visual application built with Tauri, featuring real-time audio processing, advanced visualization capabilities, and modular DSP architecture.

### 🎵 Key Features

- �️ **Modular Audio Architecture** - Two-stage initialization (Base Audio + Faust DSP)
- 🔧 **Test Signal System** - Built-in tone/noise/impulse generators for audio testing
- �🎵 **Faust DSP Integration** - Real-time audio processing with WebAssembly
- 🎨 **Multi-Window Visualizations** - Three.js & p5.js creative coding support
- 🖥️ **Advanced Device Management** - Dynamic input/output device control with routing
- 🎛️ **Dynamic Parameter Controls** - Automatic UI generation for Faust parameters
- 📱 **Cross-platform** - Windows, macOS, Linux support via Tauri
- ⏱️ **High-Precision Timing** - 2-5ms accuracy musical time management
- 🥁 **Integrated Metronome** - Accurate beat generation with lookahead scheduler

### 🚀 Current Implementation Status

#### ✅ Completed Features
- **Base Audio Layer**: DSP-independent audio functionality for immediate testing
- **TestSignalManager**: Unified test signal generation (tone/noise/impulse)
- **Enhanced Routing UI**: Streamlined audio routing with automatic monitoring
- **Multi-Window Visualizers**: Three.js and p5.js visualization support
- **Device Management**: Comprehensive input/output device handling

#### 🎯 Architecture Highlights
- **Two-Stage Audio Initialization**: `ensureBaseAudio()` → `applyFaustDSP()`
- **DSP-Independent Testing**: Test signals work without loading Faust DSP
- **Modular Design**: Clean separation between audio, visualization, and control systems
- **Event-Driven Architecture**: Reactive UI updates and state management

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Quick Start

#### 1. Clone the Template

```bash
# Clone this template
git clone https://github.com/yourusername/tauri-electronics-template.git my-audio-app
cd my-audio-app

# Install dependencies
npm install

# Install Tauri CLI (global)
npm install -g @tauri-apps/cli
```

#### 2. Start Development Server

```bash
# Start development mode with Faust support
npm run dev-with-faust
```

#### 3. Production Build

```bash
# Build for production
npm run tauri build
```

### 📁 Project Structure

```
├── src/
│   ├── audio/                    # Audio processing modules
│   │   ├── audioCore.ts         # Core audio initialization (Base + DSP layers)
│   │   ├── testSignalManager.ts # Unified test signal generation
│   │   ├── busManager.ts        # Audio routing and Logic Input management
│   │   ├── inputManager.ts      # Input device management
│   │   ├── routingUI.ts         # Audio routing user interface
│   │   └── dsp/                 # Faust DSP related modules
│   ├── visualizers/             # Visualization system
│   │   ├── visualizerManager.ts # Multi-window visualization control
│   │   ├── threeJSVisualizer.ts # 3D graphics visualization
│   │   └── p5Visualizer.ts      # Creative coding visualization
│   ├── controller.ts            # Main application controller
│   └── *.html                   # HTML interface files
├── docs/                        # Comprehensive project documentation
│   ├── README.md               # Documentation structure overview
│   ├── ARCHITECTURE_OVERVIEW.md # System architecture and design principles
│   ├── AUDIO_SYSTEM.md         # Audio system detailed documentation
│   ├── VISUALIZATION_SYSTEM.md # Visualization system documentation
│   ├── DEVELOPMENT_ROADMAP.md  # Future development plans and priorities
│   └── IMPLEMENTATION_PLAN.md  # Historical implementation progress
├── public/
│   ├── audio/                   # Pre-compiled Faust WebAssembly files
│   ├── dsp/                     # Faust DSP source files
│   └── faust/                   # Faust WebAssembly library
└── src-tauri/                   # Tauri backend (Rust)
```

### 🎛️ Audio System Architecture

```
AudioContext (Web Audio API)
    ↓
Base Audio Layer (DSP-independent)
    ├── BusManager (Audio routing)
    ├── TestSignalManager (Signal generation)
    ├── InputManager (Device management)
    └── OutputManager (Output control)
    ↓
Faust DSP Layer (Optional, for advanced processing)
    ├── FaustSynthController
    ├── FaustEffectController
    └── FaustWasmLoader
```

### Customization

#### 1. Modifying DSP

Edit Faust files in the `src/dsp/` folder to customize audio processing:

```faust
// src/dsp/mysynth.dsp
import("stdfaust.lib");

freq = hslider("frequency", 440, 20, 20000, 0.1);
gain = hslider("gain", 0.3, 0, 1, 0.01);

process = os.osc(freq) * gain;
```

#### 2. Adding Visualizations

Add visual effects using Three.js or p5.js in `src/visualizer.ts`:

```typescript
// Three.js example
const geometry = new THREE.SphereGeometry(1, 32, 32);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);
```

#### 3. UI Customization

Modify HTML files, CSS, and controller logic to customize the UI.

### Key Features

#### Audio Processing
- Real-time audio processing with Faust WebAssembly
- Dynamic parameter control
- Input/output device selection and switching
- MIDI support (coming soon)

#### Visualization
- 3D graphics with Three.js
- Creative coding with p5.js
- Multi-window support
- Fullscreen and borderless display

#### Window Management
- Multiple visualizer windows
- Window size and position control
- Always on top display
- Minimize/maximize control

### Development Tips

#### Debugging
- Check console logs in browser developer tools
- Use debug log panel in `controller.html`
- Use Tauri developer tools

#### Performance Optimization
- Adjust audio buffer size
- Control visualization frame rate
- WebAssembly optimization

### Troubleshooting

#### Common Issues

1. **Audio not playing**
   - User interaction required due to browser audio policy
   - Click "Start Audio" button

2. **Visualizer windows not opening**
   - Check popup blocker settings
   - Recommend running in Tauri mode

3. **DSP changes not reflected**
   - Click "Apply DSP" button
   - May need to recompile Faust files

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

### License

MIT License

### Contributing

Pull requests and issue reports are welcome.

### Related Links

- [Tauri](https://tauri.app/)
- [Faust](https://faust.grame.fr/)
- [Three.js](https://threejs.org/)
- [p5.js](https://p5js.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

## 日本語

Tauriを使用して高品質なオーディオ・ビジュアルアプリケーションを構築するためのプロフェッショナルテンプレートです。リアルタイムオーディオ処理と高度なビジュアライゼーション機能を備えています。

### 特徴

- 🎵 **Faust DSP** - WebAssemblyによるリアルタイムオーディオ処理
- 🎨 **Three.js & p5.js** - 3Dグラフィックスとクリエイティブコーディング
- 🖥️ **マルチウィンドウ対応** - 複数のビジュアライザーウィンドウ
- 🎛️ **デバイス管理** - 入出力デバイスの動的制御
- 🔧 **動的パラメータ制御** - Faustパラメータの自動UI生成
- 📱 **クロスプラットフォーム** - Windows, macOS, Linux対応
- ⏱️ **高精度タイミング** - 2-5ms精度の音楽的時間管理システム
- 🥁 **統合メトロノーム** - ルックアヘッドスケジューラーによる正確なビート生成

### 必要な環境

- [Node.js](https://nodejs.org/) (v16以降)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### クイックスタート

#### 1. テンプレートのクローン

```bash
# このテンプレートをクローン
git clone https://github.com/yourusername/tauri-electronics-template.git my-audio-app
cd my-audio-app

# 依存関係をインストール
npm install

# Tauri CLIをインストール（グローバル）
npm install -g @tauri-apps/cli
```

#### 2. 開発サーバーの起動

```bash
# Faustサポート付き開発モードで起動
npm run dev-with-faust
```
#### 3. プロダクションビルド

```bash
# プロダクション用ビルド
npm run tauri build
```

### プロジェクト構造

```
├── src/
│   ├── audio/              # オーディオ処理モジュール
│   │   ├── audioCore.ts    # Web Audio API コア
│   │   ├── inputManager.ts # 入力デバイス管理
│   │   └── dsp/           # DSP関連モジュール
│   ├── dsp/               # Faust DSPファイル
│   ├── types/             # TypeScript型定義
│   ├── controller.ts      # メインコントローラー
│   ├── visualizer.ts      # ビジュアライゼーション
│   └── *.html            # HTMLページ
├── src-tauri/            # Tauriバックエンド
├── public/               # 静的アセット
│   ├── audio/           # プリコンパイル済みFaustファイル
│   └── faust/           # Faust WebAssemblyライブラリ
└── package.json
```

### カスタマイズ

#### 1. DSPの変更

`src/dsp/`フォルダ内のFaustファイルを編集してオーディオ処理をカスタマイズ：

```faust
// src/dsp/mysynth.dsp
import("stdfaust.lib");

freq = hslider("frequency", 440, 20, 20000, 0.1);
gain = hslider("gain", 0.3, 0, 1, 0.01);

process = os.osc(freq) * gain;
```

#### 2. ビジュアライゼーションの追加

`src/visualizer.ts`でThree.jsまたはp5.jsを使ってビジュアルエフェクトを追加：

```typescript
// Three.jsの例
const geometry = new THREE.SphereGeometry(1, 32, 32);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);
```

#### 3. UIのカスタマイズ

HTMLファイルとCSS、コントローラーロジックを変更してUIをカスタマイズ。

### 主な機能

#### オーディオ処理
- Faust WebAssemblyによるリアルタイム音声処理
- 動的パラメータ制御
- 入出力デバイスの選択と切り替え
- MIDIサポート（準備中）

#### ビジュアライゼーション
- Three.jsによる3Dグラフィックス
- p5.jsによるクリエイティブコーディング
- マルチウィンドウサポート
- フルスクリーン・ボーダーレス表示

#### ウィンドウ管理
- 複数ビジュアライザーウィンドウ
- ウィンドウサイズ・位置の制御
- 常に最前面表示
- 最小化・最大化制御

### 開発のヒント

#### デバッグ
- ブラウザの開発者ツールでコンソールログを確認
- `controller.html`のデバッグログパネルを活用
- Tauri開発者ツールの使用

#### パフォーマンス最適化
- オーディオバッファサイズの調整
- ビジュアライゼーションのフレームレート制御
- WebAssemblyの最適化

### トラブルシューティング

#### よくある問題

1. **オーディオが再生されない**
   - ブラウザのオーディオポリシーによりユーザーインタラクションが必要
   - 「Start Audio」ボタンをクリック

2. **ビジュアライザーウィンドウが開かない**
   - ポップアップブロッカーの設定を確認
   - Tauriモードでの実行を推奨

3. **DSP変更が反映されない**
   - 「Apply DSP」ボタンをクリック
   - Faustファイルの再コンパイルが必要な場合があります

### 推奨IDE設定

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

### ライセンス

MIT License

### 貢献

プルリクエストやIssueの報告を歓迎します。

### 関連リンク

- [Tauri](https://tauri.app/)
- [Faust](https://faust.grame.fr/)
- [Three.js](https://threejs.org/)
- [p5.js](https://p5js.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
