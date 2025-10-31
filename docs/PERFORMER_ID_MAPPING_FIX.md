# PerformerID マッピング修正

## 問題
パフォーマンスキューが発行されてもマイクソースが見つからない:
```
[MicInputGate] No mic source registered for player1
[MicInputGate] No mic source registered for player2
```

## 原因
Logic Input IDとperformerIDのマッピングが間違っていました。

### 間違ったマッピング (修正前)
```typescript
// MicRouter.addMicInput()
const performerId = `performer_${id}`;  // "mic1" → "performer_mic1" ❌

// RandomScheduler
target.performerId  // "player1", "player2", "player3"

// マッピング不一致!
"performer_mic1" ≠ "player1"
```

### 正しいマッピング (修正後)
```typescript
// MicRouter.addMicInput()
const performerId = id.replace(/^mic/, 'player');  // "mic1" → "player1" ✅

// RandomScheduler
target.performerId  // "player1", "player2", "player3"

// マッピング一致!
"player1" === "player1" ✅
```

## 修正内容

### ファイル: `src/engine/audio/devices/micRouter.ts`

```typescript
// 修正前
const performerId = `performer_${id}`;  // 仮のマッピング
gateManager.registerPerformerMic(performerId, source, deviceId);
console.log(`[MicRouter] Registered mic source for ${performerId}`);

// 修正後
// "mic1" → "player1", "mic2" → "player2", etc.
const performerId = id.replace(/^mic/, 'player');
gateManager.registerPerformerMic(performerId, source, deviceId);
console.log(`[MicRouter] Registered mic source: ${id} → ${performerId}`);
```

## IDマッピング表

| Logic Input ID | Performer ID | Player Number | Description |
|---------------|--------------|---------------|-------------|
| `mic1`        | `player1`    | `"1"`         | Player 1    |
| `mic2`        | `player2`    | `"2"`         | Player 2    |
| `mic3`        | `player3`    | `"3"`         | Player 3    |

## システム全体のID使用

### Logic Inputs (`src/audio/logicInputs.ts`)
```typescript
export const defaultLogicInputs: LogicInput[] = [
    { id: 'mic1', label: 'Mic 1', ... },
    { id: 'mic2', label: 'Mic 2', ... },
    { id: 'mic3', label: 'Mic 3', ... },
];
```

### Section A Config (`src/works/acoustic-automaton/sectionAConfig.ts`)
```typescript
export const sectionASettings = {
    performerIds: ['player1', 'player2', 'player3'] as const,
    // ...
};
```

### RandomPerformanceScheduler
```typescript
interface PerformerTarget {
    performerId: string;   // "player1", "player2", "player3"
    playerNumber: string;  // "1", "2", "3"
    label?: string;
}
```

### PerformanceMessenger
```typescript
send({
    type: 'countdown',
    target: target.playerNumber,  // "1", "2", "3" (WebSocket送信用)
    data: {
        performerId: target.performerId,  // "player1", "player2", "player3"
        // ...
    }
});
```

## データフロー

### 1. マイク登録時
```
InputManager.setupMicInputs()
    ↓
MicRouter.addMicInput(id: "mic1", ...)
    ↓
create MediaStreamSource
    ↓
const performerId = id.replace(/^mic/, 'player');  // "mic1" → "player1"
    ↓
gateManager.registerPerformerMic("player1", source)
    ↓
performerMicSources.set("player1", { micSourceNode: source, ... })
```

### 2. パフォーマンスキュー発行時
```
RandomPerformanceScheduler.handleCountdown(target)
    ↓
target.performerId = "player1"
    ↓
gateManager.openGateForPerformance("player1", ...)
    ↓
const micSource = performerMicSources.get("player1");  // ✅ 見つかる!
    ↓
micSource.micSourceNode.connect(gateNode)
    ↓
trackManager.createTrack({ performerId: "player1", ... })
```

## テスト手順

### 1. ページをリロード
```
Ctrl + Shift + R
```

### 2. コンソールログ確認
マイク登録時に以下が表示されるはず:
```
[MicRouter] Registered mic source: mic1 → player1
[MicRouter] Registered mic source: mic2 → player2
[MicRouter] Registered mic source: mic3 → player3
```

### 3. Section A 開始
パフォーマンスキュー発行時に以下が表示されるはず:
```
[MicInputGate] Creating new track for player1
[MicInputGate] Connected mic source to gate node
[PerformanceTrackManager] Creating track player1_1729123456789_abc123
```

**エラーが出ないこと**:
```
❌ [MicInputGate] No mic source registered for player1  ← これが出なくなる
```

### 4. 音の確認
- カウントダウン中: 音がフェードイン
- 演奏中: クリアな音 + リバーブ
- 演奏後: フェードアウト

## デバッグコマンド

### マッピングを確認
```javascript
// ブラウザコンソールで実行
const { getGlobalMicInputGateManager } = await import('./engine/audio/devices/micInputGate.js');
const gateManager = getGlobalMicInputGateManager();

// 内部的に登録されているperformerIdを確認
console.log('Registered performers:', gateManager.performerMicSources);
// 期待: Map { "player1" => {...}, "player2" => {...}, "player3" => {...} }
```

### MicRouterのIDを確認
```javascript
const micRouter = window.inputManager.getMicRouter();
const mics = micRouter.getMicInputs();

mics.forEach(mic => {
    console.log(`Mic ID: ${mic.id}`);
    // 期待: "mic1", "mic2", "mic3"
});
```

### performerIdの変換テスト
```javascript
const testIds = ['mic1', 'mic2', 'mic3'];
testIds.forEach(id => {
    const performerId = id.replace(/^mic/, 'player');
    console.log(`${id} → ${performerId}`);
});
// 期待:
// mic1 → player1
// mic2 → player2
// mic3 → player3
```

## トラブルシューティング

### Q: まだ "No mic source registered" エラーが出る
A: 以下を確認:
1. マイクが正しく登録されているか
   ```javascript
   const gateManager = getGlobalMicInputGateManager();
   console.log('Registered sources:', Array.from(gateManager.performerMicSources.keys()));
   // 期待: ["player1", "player2", "player3"]
   ```

2. performerIdが正しく送信されているか
   ```javascript
   // RandomScheduler内でログ確認
   console.log('Sending to performerId:', target.performerId);
   // 期待: "player1", "player2", or "player3"
   ```

### Q: 特定のplayerだけ音が出ない
A: そのplayerのマイクが登録されているか確認:
```javascript
const gateManager = getGlobalMicInputGateManager();
const micSource = gateManager.performerMicSources.get('player2');
console.log('Player2 mic source:', micSource);
// null なら登録されていない
```

### Q: ID変換が正しく動作しない
A: Logic InputsのIDが想定と異なる可能性:
```javascript
const micRouter = window.inputManager.getMicRouter();
const mics = micRouter.getMicInputs();
console.log('Actual mic IDs:', mics.map(m => m.id));
// 期待: ["mic1", "mic2", "mic3"]
// もし違うなら、replace()のパターンを調整
```

## 関連する定数

### ファイル: `src/works/acoustic-automaton/sectionAConfig.ts`
```typescript
performerIds: ['player1', 'player2', 'player3'] as const
```

### ファイル: `src/audio/logicInputs.ts`
```typescript
id: 'mic1'  // Logic Input ID
```

### 変換ルール
```
Logic Input ID pattern: /^mic(\d+)$/
Performer ID pattern: player\d+

変換: id.replace(/^mic/, 'player')
```

## 将来の拡張

### 柔軟なマッピング
将来的により柔軟なマッピングが必要な場合:

```typescript
// config/performerMapping.ts
export const performerMapping: Record<string, string> = {
    'mic1': 'player1',
    'mic2': 'player2',
    'mic3': 'player3',
    // 将来的に追加可能
    'mic4': 'player4',
    'external_mic_1': 'guest_performer_1',
};

// micRouter.ts
const performerId = performerMapping[id] || id.replace(/^mic/, 'player');
```

## まとめ

### 修正前の問題
- `"mic1"` → `"performer_mic1"` (間違い)
- `performerMicSources.get("player1")` → `undefined` (見つからない)

### 修正後の動作
- `"mic1"` → `"player1"` (正しい)
- `performerMicSources.get("player1")` → マイクソース (見つかる!)
- トラック作成成功 → 音が出る ✅

## 関連ドキュメント
- [PERFORMANCE_TRACK_SYSTEM.md](./PERFORMANCE_TRACK_SYSTEM.md)
- [MIC_NO_SOUND_FIX.md](./MIC_NO_SOUND_FIX.md)
- [MIC_ALWAYS_ON_FIX.md](./MIC_ALWAYS_ON_FIX.md)
