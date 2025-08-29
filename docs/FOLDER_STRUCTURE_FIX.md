# フォルダ構成修正ログ

## 修正内容

### 🚨 **問題点**
パフォーマンス関連ファイルが共通エンジン層（`src/`直下）に配置されており、作品固有実装と共通エンジンが混在していました。

### ✅ **修正後の正しい構成**

#### **作品固有実装**: `src/works/acoustic-automaton/`
```
src/works/acoustic-automaton/
├── performance/                    # パフォーマンス制御
│   ├── acousticAutomaton.ts       # 音響処理（第1部）
│   ├── visualSystem.ts            # 映像システム（第1部）
│   └── performanceController.ts   # 統合制御
├── ui/                            # 作品専用UI
│   └── performance.html           # パフォーマンス実行画面
├── audio/                         # 作品固有音響処理
│   └── routing/                   # 音響ルーティング
└── visual/                        # 作品固有映像処理
```

#### **共通エンジン**: `src/engine/`
```
src/engine/
├── audio/                         # 音響エンジン（再利用可能）
│   ├── core/                      # 基本機能
│   ├── devices/                   # デバイス管理
│   ├── processing/                # 音響処理
│   └── dsp/                       # DSP統合
├── visual/                        # 映像エンジン
├── framework/                     # フレームワーク
└── timing/                        # タイミング制御
```

## 移動したファイル

### パフォーマンス関連
- `src/performance/acousticAutomaton.ts` → `src/works/acoustic-automaton/performance/acousticAutomaton.ts`
- `src/performance/visualSystem.ts` → `src/works/acoustic-automaton/performance/visualSystem.ts`  
- `src/performance/performanceController.ts` → `src/works/acoustic-automaton/performance/performanceController.ts`

### UI関連
- `src/performance.html` → `src/works/acoustic-automaton/ui/performance.html`

## 修正したインポートパス

### performance.html
```html
<!-- 修正前 -->
import { AcousticAutomatonController } from './src/performance/performanceController.js';

<!-- 修正後 -->
import { AcousticAutomatonController } from '../performance/performanceController.js';
```

## アクセスURL変更

### パフォーマンス画面
```
修正前: http://localhost:5175/src/performance.html
修正後: http://localhost:5175/src/works/acoustic-automaton/ui/performance.html
```

## 設計原則の遵守

### 1. **関心の分離**
- 共通エンジン: 複数作品で再利用可能
- 作品固有実装: 音響的オートマトン専用

### 2. **スケーラビリティ**
- 新しい作品を `src/works/` に追加可能
- エンジンの拡張が作品に影響しない

### 3. **保守性**
- 作品固有のバグが共通エンジンに影響しない
- 明確なファイル配置でデバッグが容易

## 今後の作品追加例

```
src/works/
├── acoustic-automaton/           # 現在の作品
├── future-work-1/               # 将来の作品1
│   ├── performance/
│   ├── ui/
│   └── audio/
└── future-work-2/               # 将来の作品2
    ├── performance/
    ├── ui/
    └── visual/
```

## メリット

1. **コードの再利用性向上**: エンジン部分が他作品でも使用可能
2. **開発効率向上**: 作品固有の変更が他に影響しない
3. **バージョン管理改善**: 作品とエンジンの変更履歴が分離
4. **チーム開発対応**: 担当領域が明確化

---

修正日: 2025年8月24日  
対象: フォルダ構成とファイル配置  
影響: パフォーマンス画面のアクセスURL変更
