# Next Tasks: Base Audio Initialization & Test Signal Before Apply DSP

目的: "Apply DSP" を押す前でも Logic Inputs のテスト信号 (Tone / Noise / Impulse) が動作する構成へ移行する。
推奨アプローチ: A + C ハイブリッド
- A: Audio 初期化を 2 段階化 (Base Audio と DSP 適用を分離)
- C: テスト信号は Faust / DSP チェーン非依存で Logic Input の Gain Node へ直接注入

---
## フェーズ概要

### Phase 1: Base Audio 層の分離 (ensureBaseAudio)
目的: DSP 未適用でも AudioContext / busManager / outputGainNode を利用可能にする。
タスク:
1. initAudio 現行処理を分割
   - 新規: ensureBaseAudio()
     - AudioContext 作成 (既存があれば再利用)
     - outputGainNode / outputMeter 初期化
     - busManager を Faust 依存無しで構築 (effectsInput は空 GainNode チェーン)
     - event: dispatchEvent('audio-base-ready')
   - 既存 initAudio → applyFaustDSP() にリネーム（DSP 部分のみ）
2. コード参照更新
   - UI の "Apply DSP" ボタン: ensureBaseAudio() → applyFaustDSP() の順で呼ぶ (Base 未準備時)
   - 既存箇所の initAudio 呼び出しを置換
3. busManager コンストラクタ内で Faust Node 接続前提コードがあれば防御 (null ガード)
4. 既存ロジック: faustNode 接続は applyFaustDSP() 完了時に挿入

### Phase 2: TestSignalManager 導入
目的: テスト信号生成を UI 直書きから分離し再利用性/管理性アップ。
タスク:
1. src/audio/testSignalManager.ts (新規)
   - interface TestSignalSpec { type: 'tone'|'noise'|'impulse'; id: string; startedAt: number; nodes: AudioNode[] }
   - class TestSignalManager
     - start(type, logicInputId, opts?)
     - stop(logicInputId)
     - stopAll()
     - ensureInputGain(logicInputId) → busManager.ensureInput + getInputGainNode
   - ノード生成
     - tone: OscillatorNode + Gain (0.3~0.4) / duration 0.6s
     - noise: キャッシュ 1 秒ホワイトノイズ Buffer (振幅 0.25) から 0.6s 再生
     - impulse: length ~0.1s / data[0] = 1.0
   - ルート: source → (optional EG) → inputGainNode
   - monitor/synth/effects すべて false の場合: 一時的に monitor true / 終了後復元
   - active 状態変更時に CustomEvent('test-signal-state', { detail:{ id, active } })
2. シングルトンを window.testSignalManager へ公開

### Phase 3: routingUI の inject 差し替え
目的: 直接 AudioContext / busManager に依存する実装を TestSignalManager API 使用へ移行。
タスク:
1. 現行 inject 関数を削除 / 置換: manager.start('tone'|...)
2. AudioContext 未初期化時の挙動
   - ensureBaseAudio() を呼ぶ (await) ※ エラー時 UI に alert
3. エラーメッセージから "Apply DSP first" という文言を撤去し "Audio Engine initializing..." 系へ変更

### Phase 4: Apply DSP (Faust) 適用時の統合
目的: DSP 適用後もテスト信号継続性を確保。
タスク:
1. applyFaustDSP() 完了後: 既存 Input Gain Node 接続は維持されるよう busManager 側で再構築時の detach を避ける or 再接続
2. 既存 Track / Logic Input の volume / routing 変更で test signal が切れないか確認
3. 必要なら busManager に再構築フック: onRebuild(callback)

### Phase 5: クリーンアップ / マイグレーション
目的: 安定性とメモリ最適化。
タスク:
1. noiseBuffer / impulseBuffer のキャッシュ (TestSignalManager 内 static or private field)
2. Logic Input 削除時: 自動 stop (LogicInputManager の remove 呼出し箇所でフック)
3. ページ終了 / AudioContext close 時: stopAll()
4. ドキュメント更新 (README / IMPLEMENTATION_PLAN)

### Phase 6 (Optional / 後続)
- 長時間再生機能 (sustain) オプション
- 任意周波数 / レベル UI
- Sweep / Pink noise / Multi-impulse 追加
- 同時再生状態一覧 UI (停止ボタン集約)

---
## 変更差分サマリ (予定)
新規: src/audio/baseAudio.ts (ensureBaseAudio でも可 / audioCore.ts 内分離でも可)
新規: src/audio/testSignalManager.ts
変更: audioCore.ts (initAudio 分割 → ensureBaseAudio + applyFaustDSP)
変更: controller.ts (Apply DSP ボタンハンドラ更新)
変更: routingUI.ts (inject → TestSignalManager API 利用)
変更: busManager.ts (Faust 未接続許容 / ensureInput safety)
変更: README / IMPLEMENTATION_PLAN (仕様更新)

---
## 擬似コード例
ensureBaseAudio():
```
if (window.audioBaseReady) return;
ctx = new AudioContext();
outputGain = ctx.createGain();
outputMeter = ctx.createAnalyser();
outputGain.connect(outputMeter).connect(ctx.destination);
window.busManager = new BusManager(ctx, outputGain); // Faust なし
window.audioBaseReady = true;
dispatchEvent('audio-base-ready');
```

applyFaustDSP():
```
if (!window.audioBaseReady) await ensureBaseAudio();
compile faust → node
node.connect(busManager.getEffectsInputNode());
window.faustNode = node;
dispatchEvent('faust-dsp-applied');
```

TestSignalManager.start(type,id):
```
await ensureBaseAudio();
const g = busManager.ensureInput(id) && busManager.getInputGainNode(id);
adjust routing temp if all false;
switch(type){ tone|noise|impulse ... };
setup source.stop(time); onended -> cleanup & restore routing
```

---
## リスクと緩和
| リスク | 内容 | 緩和策 |
| ------ | ---- | ------ |
| 二重初期化 | ensureBaseAudio 多重呼出 | フラグ + Promise キャッシュ |
| 既存コード互換 | initAudio リネームで参照壊れ | 旧 API ラッパー残す deprecation log |
| ルーティング再構築時切断 | busManager rebuild が test signal を切る | rebuild で inputGainNode は維持・再接続 |
| CPU 負荷 | 多数 Analyser 生成 | 後続最適化 (共有 Analyser + script) |

---
## 実装順チェックリスト
[ ] Phase1 ensureBaseAudio 実装 / 分割
[ ] controller.ts ボタン更新
[ ] 旧 initAudio ラッパー (コンソールに警告) 追加
[ ] TestSignalManager 追加
[ ] routingUI inject 差し替え
[ ] 動作テスト (DSP 未適用で Tone/Noise/Impulse 再生)
[ ] DSP 適用後の継続テスト
[ ] マイグレーション文言更新
[ ] README / IMPLEMENTATION_PLAN 更新
[ ] キャッシュ (noise / impulse)
[ ] クリーンアップフック (LogicInput remove / window unload)

---
## メモ
- 最初のユーザー体験改善: 画面ロード直後に "Apply DSP" なしでテスト確認可能。
- 後から Faust DSP を適用しても既存テスト信号 UI はそのまま維持。
- 将来: test 信号を内部バスに送り込み FX チェーン検証も可能。

以上。着手時は Phase1 から順に進めれば OK。
