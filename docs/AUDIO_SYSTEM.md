# Audio System Documentation

## Audio Processing Architecture

### Core Components

#### 1. Base Audio Layer
**ファイル**: `src/audio/audioCore.ts`

```typescript
// 2段階初期化システム
export async function ensureBaseAudio(): Promise<void>
export async function applyFaustDSP(): Promise<void>
export async function initAudio(): Promise<void> // Legacy wrapper
```

**責務**:
- AudioContext初期化とサスペンド/リジューム管理
- BusManager, TestSignalManager, InputManagerの初期化
- 基本的な音声ルーティングチェーンの構築
- DSP非依存での音声システム起動

#### 2. Test Signal System
**ファイル**: `src/audio/testSignalManager.ts`

```typescript
class TestSignalManager {
  start(type: 'tone' | 'noise' | 'impulse', logicInputId: string, options?: TestSignalOptions): void
  stop(logicInputId: string): void
  stopAll(): void
}
```

**機能**:
- **Tone**: 440Hz Sawtooth波、0.6秒、エンベロープ付き
- **Noise**: ホワイトノイズ、0.6秒、バッファキャッシュ最適化
- **Impulse**: 短時間インパルス、0.1秒、急峻な立ち上がり/減衰

**特徴**:
- Logic Input直接注入による高品質ルーティング
- クリックノイズ防止のエンベロープ処理
- 自動停止とメモリ管理
- 重複再生の自動制御

#### 3. Bus Management System
**ファイル**: `src/audio/busManager.ts`

Logic Input, Track, Effectの音声ルーティングを統合管理。

```typescript
class BusManager {
  getLogicInputGainNode(id: string): GainNode
  getTrackGainNode(id: string): GainNode
  connectToEffectsChain(source: AudioNode): void
}
```

#### 4. Input Management
**ファイル**: `src/audio/inputManager.ts`

マイクロフォン入力とデバイス管理を担当。

### Audio Signal Flow

```
Input Devices (Microphone)
    ↓
InputManager → MicRouter
    ↓
Logic Inputs (BusManager)
    ↓
Track Processing
    ↓
Effects Chain (Faust DSP)
    ↓
Output Gain → Output Meter → Destination
```

**⚠️ 出力系統の詳細仕様は [OUTPUT_ROUTING_REQUIREMENTS.md](./OUTPUT_ROUTING_REQUIREMENTS.md) を参照**

### Output Routing (出力ルーティング)

**メイン出力 (Main Output):**
- 用途: 観衆が聴く音
- チャンネル: ステレオ (拡張可能)
- 信号源: すべての演奏音源 (クリック除く)

**モニター出力 (Monitor Outputs x3):**
- 用途: 奏者への返し + クリック
- 構成: 3系統 (Performer 1, 2, 3)
- ミキシング: 自分の音(大) + 他の奏者(小) + クリック

詳細設計は [OUTPUT_ROUTING_REQUIREMENTS.md](./OUTPUT_ROUTING_REQUIREMENTS.md) を参照。

### Faust DSP Integration

#### DSP Controllers
- `src/audio/dsp/faustSynthController.ts` - シンセサイザーDSP制御
- `src/audio/dsp/faustEffectController.ts` - エフェクトDSP制御
- `src/audio/dsp/faustWasmLoader.ts` - WebAssembly動的ロード

#### DSP Files Location
- `public/dsp/*.dsp` - Faustソースファイル
- `public/audio/*.wasm` - コンパイル済みWebAssemblyファイル

### Performance Considerations

#### Memory Management
- TestSignalManager: バッファキャッシュによるメモリ効率化
- BusManager: 動的ノード作成/削除の最適化
- AudioContext: 適切なサスペンド/リジューム制御

#### Latency Optimization
- AudioWorklet移行計画（将来実装）
- バッファサイズ調整
- リアルタイム処理最適化

### Error Handling

#### Base Audio未初期化
```typescript
if (!window.audioBaseReady) {
  throw new Error("Base audio not initialized. Call ensureBaseAudio() first.");
}
```

#### DSP初期化失敗
- Faustコンパイルエラーの適切な表示
- フォールバック処理の実装
- ユーザー向けエラーメッセージ

### API Reference

#### Global State
```typescript
// Window拡張
interface Window {
  audioBaseReady?: boolean;
  faustNode?: AudioWorkletNode;
  busManager?: BusManager;
  testSignalManager?: TestSignalManager;
  logicInputManagerInstance?: LogicInputManager;
}
```

#### Events
- `'audio-base-ready'` - Base Audio初期化完了
- `'faust-dsp-applied'` - Faust DSP適用完了
- `'audio-context-suspended'` - AudioContext一時停止
- `'audio-context-resumed'` - AudioContext再開

### Testing

#### Manual Testing
- Test Signal injection for各Logic Input
- ルーティング確認用テストパターン
- デバイス切り替えテスト

#### Automated Testing
- Unit tests for TestSignalManager
- Integration tests for BusManager
- End-to-end audio flow testing（計画中）

### Migration Notes

#### Legacy Code
旧`initAudio()`は後方互換性のため保持。新規実装では`ensureBaseAudio()`使用を推奨。

#### Breaking Changes
- TestSignalManager導入により、inline test signal生成コードは非推奨
- RoutingUI APIの変更（直接AudioContext操作から統合API使用へ）

### Future Enhancements

#### Planned Features
- AudioWorklet移行（低レイテンシ実現）
- MIDI同期機能
- レコーディング機能（AudioWorklet使用）
- マルチデバイス同期

#### Performance Targets
- レイテンシ: <10ms（現在 ~20ms）
- CPU使用率: <15%（現在 ~25%）
- メモリ使用量: <100MB（現在 ~150MB）
