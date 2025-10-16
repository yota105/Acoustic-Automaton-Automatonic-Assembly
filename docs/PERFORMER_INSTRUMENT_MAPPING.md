# 奏者と楽器の対応付け

## 概要
このドキュメントは、Logic Inputs、Performer ID、楽器名の対応関係を定義します。

## ID対応表

| Logic Input ID | ラベル (楽器名) | Performer ID | 担当楽器 |
|---------------|---------------|--------------|---------|
| mic1          | Horn 1        | player1      | Horn 1  |
| mic2          | Horn 2        | player2      | Horn 2  |
| mic3          | Trombone      | player3      | Trombone|

## オーディオフロー

```
Horn 1 奏者 → Mic Device → Logic Input (mic1) → MicRouter → player1 → Gate → Track → effectsBus → Reverb → Output
Horn 2 奏者 → Mic Device → Logic Input (mic2) → MicRouter → player2 → Gate → Track → effectsBus → Reverb → Output
Trombone 奏者 → Mic Device → Logic Input (mic3) → MicRouter → player3 → Gate → Track → effectsBus → Reverb → Output
```

## パフォーマンスキュー動作

Section Aでは、各奏者に対してランダムなタイミングで合図(カウントダウン)が送られます:

1. **カウントダウン開始**: 5秒前から画面に表示
   - 各奏者のプレイヤー画面に個別に表示
   - 他の奏者には見えない

2. **カウント0秒時**: ゲートが開き、マイク入力が処理開始
   - GateNode gain: 0 → 1 (0.5秒でフェードイン)
   - 奏者は音を出す

3. **ホールド期間**: 設定された時間マイク入力を処理
   - 現在設定: 3秒

4. **ゲート閉じ**: マイク入力を徐々にフェードアウト
   - GateNode gain: 1 → 0 (1秒でフェードアウト)

5. **トラッククリーンアップ**: 一定時間後にトラック削除
   - 現在設定: 5秒後

## リバーブ処理

全ての奏者の音声は共通のリバーブエフェクトを通過します:

```typescript
// src/works/acoustic-automaton/sectionAConfig.ts
reverb: {
    roomSize: 0.9,      // 大きな空間感
    damping: 0.3,       // 高域減衰
    wetLevel: 0.8,      // リバーブ成分80%
    dryLevel: 0.2,      // 原音20%
    width: 1.0          // ステレオ幅最大
}
```

## マイク接続設定

### メイン機(Performance画面)での設定
1. Audio Control Panelを開く
2. 各Logic Inputに物理マイクデバイスをアサイン:
   - **Horn 1**: 奏者1のマイクデバイスを選択
   - **Horn 2**: 奏者2のマイクデバイスを選択
   - **Trombone**: 奏者3のマイクデバイスを選択
3. 各Inputの"Enable"をONにする

### プレイヤー機での表示
- プレイヤー画面ではマイク接続は不要
- カウントダウン表示と楽譜表示のみ

## Section A タイミング設定

```typescript
// 初期タイミング(0-25秒)
minInterval: 5000ms (5秒)
maxInterval: 8000ms (8秒)

// 第1進化(25-45秒)
minInterval: 3000ms (3秒)
maxInterval: 5000ms (5秒)

// 第2進化(45-60秒)
minInterval: 1500ms (1.5秒)
maxInterval: 2500ms (2.5秒)
```

時間経過とともに合図の間隔が徐々に短くなり、演奏密度が高まります。

## デバッグ用コンソールログ

正常動作時のログ例:

```
[MicRouter] Registered mic source: mic1 → player1
[MicRouter] Registered mic source: mic2 → player2
[MicRouter] Registered mic source: mic3 → player3
[RandomScheduler] Sending countdown to player1 at 5.234s
[MicInputGate] Opening gate for player1 (hold: 3000ms)
[PerformanceTrackManager] Creating track player1_1729xxx
[PerformanceTrackManager] Track player1_1729xxx created successfully
[MicInputGate] Gate opening completed for player1
[MicInputGate] Gate closing scheduled for player1 at +3500ms
[PerformanceTrackManager] Marking track player1_1729xxx as inactive
[PerformanceTrackManager] Scheduling cleanup for player1_1729xxx in 5000ms
[PerformanceTrackManager] Removing track player1_1729xxx
```

## トラブルシューティング

### 問題: "No mic source registered for playerX"
- **原因**: Logic InputのIDとPerformer IDの不一致
- **解決**: LocalStorageをクリアして再度Logic Inputsを作成
  ```javascript
  localStorage.clear();
  location.reload();
  ```

### 問題: マイクをEnableにすると常に音が出る
- **原因**: MicRouterが直接出力に接続されている
- **解決**: 最新コードでは修正済み(直接接続なし)

### 問題: カウントダウン0秒で音が出ない
- **原因**: Gateの出力先が間違っている
- **解決**: 最新コードではeffectsBusに正しく接続済み

## 関連ファイル

- `src/ui/audioControlPanels.ts` - Logic Inputs初期化(ID: mic1,2,3)
- `src/engine/audio/devices/micRouter.ts` - ID変換(mic→player)
- `src/engine/audio/devices/micInputGate.ts` - Mic登録とゲート制御
- `src/engine/audio/devices/performanceTrackManager.ts` - トラック管理
- `src/works/acoustic-automaton/sectionAConfig.ts` - Performer ID定義
- `src/performance/randomScheduler.ts` - カウントダウン送信

## 更新履歴

- 2025-10-16: 初版作成 - Logic Input IDとPerformer IDの明示的対応付け定義
