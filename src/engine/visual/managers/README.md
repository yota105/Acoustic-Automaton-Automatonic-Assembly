# Visualizers Directory

このディレクトリには、ビジュアライゼーション機能が分離された形で格納されています。

## ファイル構成

### Core Components

- **`p5Visualizer.ts`** - p5.jsを使用した2Dビジュアライゼーション
- **`threeJSVisualizer.ts`** - Three.jsを使用した3Dビジュアライゼーション  
- **`windowController.ts`** - Tauriウィンドウ制御とフォールバック処理
- **`visualizerManager.ts`** - 全体の統合管理クラス
- **`index.ts`** - エクスポート定義

## 使用方法

### 基本的な使用例

```typescript
import { VisualizerManager } from './visualizers/visualizerManager';

// すべてのビジュアライザーを一度に初期化
const visualizerManager = new VisualizerManager();

// 個別のビジュアライザーにアクセス
const p5Viz = visualizerManager.getP5Visualizer();
const threeViz = visualizerManager.getThreeJSVisualizer();
const windowCtrl = visualizerManager.getWindowController();
```

### 個別使用例

```typescript
import { P5Visualizer, ThreeJSVisualizer, WindowController } from './visualizers';

// p5.jsビジュアライザーのみ使用
const p5Viz = new P5Visualizer();

// Three.jsビジュアライザーのみ使用
const threeViz = new ThreeJSVisualizer();
threeViz.startAnimation();

// ウィンドウ制御のみ使用
const windowCtrl = new WindowController();
await windowCtrl.handleCommand({ type: "maximize" });
```

## 機能詳細

### P5Visualizer

- **機能**: p5.jsを使用した2Dビジュアライゼーション
- **特徴**: 
  - アニメーション円の描画
  - マウスクリックでオーディオ再開
  - 動的リサイズ対応

### ThreeJSVisualizer

- **機能**: Three.jsを使用した3Dビジュアライゼーション
- **特徴**:
  - 回転するワイヤフレームキューブ
  - 透明背景対応
  - カスタマイズ可能なシーン要素

### WindowController

- **機能**: Tauriウィンドウ制御とブラウザフォールバック
- **対応コマンド**:
  - `toggle-visibility` - 表示/非表示切り替え
  - `toggle-border` - ボーダー切り替え
  - `toggle-maximize` - 最大化切り替え
  - `fullscreen` - フルスクリーン切り替え
  - `borderless-maximize` - ボーダーレス最大化
  - `resize` - サイズ変更
  - `minimize` - 最小化
  - `center` - 中央配置
  - `toggle-always-on-top` - 常に最前面切り替え

### VisualizerManager

- **機能**: 全ビジュアライザーの統合管理
- **特徴**:
  - すべてのビジュアライザーの一括初期化
  - Tauri/postMessageイベントハンドリング
  - コマンド処理の自動振り分け

## カスタマイズ

### 新しいビジュアライゼーションの追加

1. 新しいクラスファイルを作成 (例: `customVisualizer.ts`)
2. `VisualizerManager`に統合
3. `index.ts`にエクスポートを追加

### エフェクトの変更

```typescript
// Three.jsの例
const threeViz = visualizerManager.getThreeJSVisualizer();
threeViz.setCubeColor(0xff0000); // 赤色に変更
threeViz.setCameraPosition(0, 5, 10); // カメラ位置変更
```

## 依存関係

- p5.js
- Three.js  
- @tauri-apps/api (Tauri環境の場合)

## トラブルシューティング

- **ビジュアライザーが表示されない**: HTMLに適切なcanvas要素があることを確認
- **Tauriコマンドが動作しない**: ブラウザモードではフォールバック処理が適用されます
- **アニメーションが止まる**: `startAnimation()`が呼ばれているか確認
