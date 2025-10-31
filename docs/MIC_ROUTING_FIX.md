# マイク入力ルーティング修正 - トラブルシューティングガイド

## 問題: マイクをEnableにすると常に音が出る

### 原因
旧システムの実装が残っていて、`MicRouter`でマイク入力が直接`mixerNode`に接続されていました。

```typescript
// 問題のあったコード
gainNode.connect(this.mixerNode!);  // ← 常に出力に接続されていた
```

これにより、マイクをEnableにした瞬間からゲート制御とは無関係に音が出力されていました。

## 解決策

### 1. MicRouter の修正
**ファイル**: `src/engine/audio/devices/micRouter.ts`

#### 変更内容
```typescript
// 修正後: gainNodeは出力に接続しない
// マイクソースは、PerformanceTrackManagerによって作成されるトラックを通してのみ音が出る
console.log(`[MicRouter] Created gain node for ${id}, but NOT connected to mixer (track-based routing)`);
```

**重要**: マイク入力は登録されるだけで、直接的な出力接続は行いません。

#### setMicEnabled の動作変更
```typescript
setMicEnabled(id: string, enabled: boolean): void {
    // gainNodeの操作を削除
    micInput.enabled = enabled;
    console.log(`⚠️ Set mic ${id} enabled: ${enabled} (legacy method, audio routing controlled by track gates)`);
    
    if (enabled) {
        console.log(`ℹ️ Mic ${id} is registered. Audio will play only when performance cues trigger track gates.`);
    }
}
```

**注意**: UIでマイクをEnableにしても音は出ません。音が出るのはパフォーマンスキュー(合図)が発行された時のみです。

### 2. MicInputGateManager の修正
**ファイル**: `src/engine/audio/devices/micInputGate.ts`

#### 追加: マイクソース → ゲートノードの接続
```typescript
openGateForPerformance(...): string | null {
    // ...
    const gateNode = this.audioContext.createGain();
    gateNode.gain.value = 0;
    
    // 重要: マイクソースをゲートに接続
    micSource.micSourceNode.connect(gateNode);  // ← 追加
    console.log(`[MicInputGate] Connected mic source to gate node`);
    
    // トラック作成...
}
```

これにより、**合図ごとに新しいゲートが作成され、マイクソースと接続されます**。

### 3. PerformanceTrackManager の修正
**ファイル**: `src/engine/audio/devices/performanceTrackManager.ts`

#### 追加: トラック削除時の接続解除
```typescript
removeTrack(trackId: string): void {
    // ...
    try {
        // マイクソース → ゲートの接続を切断
        track.micSourceNode.disconnect(track.gateNode);  // ← 追加
        
        // その他のノードも切断
        track.gateNode.disconnect();
        track.trackGainNode.disconnect();
    }
    // ...
}
```

これにより、トラック終了時に正しくクリーンアップされます。

## 新しいオーディオフロー

### 旧システム(問題あり)
```
[マイク入力] → [GainNode] → [MixerNode] → [出力]
                   ↑
            UIでEnable → 常に接続 → 常に音が出る
```

### 新システム(修正後)
```
[マイク入力] (登録のみ、接続なし)
      ↓
パフォーマンスキュー発行
      ↓
[マイク入力] → [新GateNode] → [TrackGain] → [Reverb] → [出力]
                   ↑
              gain: 0 → 1 → 0 (フェードイン/アウト)
      ↓
トラック終了
      ↓
[接続解除・削除]
```

## 動作確認

### 1. マイクを有効にする
```
[Logic Inputs] → [Mic 1: Enable]
```

**期待される動作**:
- コンソールに警告メッセージが表示される
- 音は**出ない**
- マイクソースは内部で登録される

**コンソール出力例**:
```
[MicRouter] ⚠️ Set mic 1 enabled: true (legacy method, audio routing controlled by track gates)
[MicRouter] ℹ️ Mic 1 is registered. Audio will play only when performance cues trigger track gates.
```

### 2. パフォーマンスキュー発行
```
Section A 開始 → ランダムスケジューラーがカウントダウン送信
```

**期待される動作**:
- 新しいトラックが作成される
- ゲートがフェードイン
- カウントダウン終了後、1秒間全開
- その後0.8秒でフェードアウト
- 音が聞こえる(ゲートが開いている時のみ)

**コンソール出力例**:
```
[MicInputGate] Creating new track for performer_1
[MicInputGate] Connected mic source to gate node
[PerformanceTrackManager] Creating track performer_1_1729123456789_abc123
[MicInputGate] Track performer_1_1729123456789_abc123 created and gate opened
[RandomScheduler] Track performer_1_1729123456789_abc123 created for performer_1
```

### 3. トラック終了
```
フェードアウト完了 → 5秒後
```

**期待される動作**:
- トラックが終了
- 接続が解除される
- メモリから削除される
- 音が**止まる**

**コンソール出力例**:
```
[PerformanceTrackManager] Track performer_1_1729123456789_abc123 ended at 123.456
[MicInputGate] Track performer_1_1729123456789_abc123 cleaned up
[PerformanceTrackManager] Track performer_1_1729123456789_abc123 removed from memory
```

## トラブルシューティング

### Q: マイクをEnableにしても何も起こらない
A: **正常です**。新システムでは、マイクをEnableにしただけでは音は出ません。
   パフォーマンスキュー(合図)が発行されるまで待ってください。

### Q: 合図を送っても音が出ない
A: 以下を確認:
1. Section A が初期化されているか
   ```typescript
   // コンソールで確認
   const gateManager = getGlobalMicInputGateManager();
   console.log(gateManager);  // 初期化されているか
   ```

2. マイクソースが登録されているか
   ```
   [MicRouter] Registered mic source for performer_1  // ← このログが出ているか
   ```

3. トラックが作成されているか
   ```typescript
   const trackManager = getGlobalPerformanceTrackManager();
   console.log(trackManager.getStats());
   ```

### Q: 音が出続ける(ゲートが閉じない)
A: 
1. タイミングパラメータを確認
   ```typescript
   // randomScheduler.ts
   gateManager.openGateForPerformance(
       performerId,
       this.countdownSeconds,  // ← カウントダウン時間
       1.0,                    // ← ホールド時間
       0.8                     // ← フェードアウト時間
   );
   ```

2. setTimeout が実行されているか確認
   - ブラウザのパフォーマンスタブで確認

### Q: 古いトラックが残り続ける
A: 定期的なクリーンアップを実行:
```typescript
// compositionPlayer.ts などに追加
setInterval(() => {
    const trackManager = getGlobalPerformanceTrackManager();
    trackManager.cleanupOldTracks(60);
}, 30000);
```

## UIの説明(ユーザー向け)

### Logic Inputs の「Enable」の意味
**旧システム**: Enable = 音が出る
**新システム**: Enable = マイク登録(音は合図で出る)

### ユーザーへの説明文例
```
マイク入力を有効にすると、システムにマイクが登録されます。
実際に音が出力されるのは、パフォーマンスキュー(合図)が発行された時のみです。

これにより、以下の利点があります:
- 不要な音の混入を防ぐ
- 各パフォーマンスを独立したトラックとして処理
- 将来的なエフェクト処理(グラニュラー、ピッチシフト)に対応
```

## まとめ

### 修正前
- マイクEnable → 即座に音が出る
- ゲート制御が効かない
- 全ての音がマスターに混ざる

### 修正後
- マイクEnable → 登録のみ(音は出ない)
- ゲート制御で音の出入りを管理
- 各合図ごとに独立したトラック

### 重要ポイント
1. **マイク入力は直接出力に接続されません**
2. **音が出るのはゲートが開いている時のみ**
3. **各合図ごとに新しいトラックとゲートが作成されます**
4. **トラックは自動的にクリーンアップされます**

## 関連ドキュメント
- [PERFORMANCE_TRACK_SYSTEM.md](./PERFORMANCE_TRACK_SYSTEM.md) - 全体システムの説明
- [SECTION_A_IMPLEMENTATION.md](./SECTION_A_IMPLEMENTATION.md) - Section A の実装詳細
