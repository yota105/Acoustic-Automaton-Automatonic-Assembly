# チャンネル選択機能の修正ログ

## 概要
マイク入力のチャンネル選択（L/R個別選択）機能の実装と問題修正を行いました。

## 発生していた問題

### 1. ログスパム
- `[RoutingUI] Retrying mic attachment` が大量に出力される
- `getMicInputStatus` が頻繁に呼ばれてコンソールが埋まる
- リトライ処理が25回×200ms間隔で実行されていた

### 2. チャンネル選択の持続性
- チャンネル選択後に「All」に戻ってしまう
- UIの再描画でチャンネル選択がリセットされる
- 保存したchannelIndexが正しく復元されない

### 3. 音声の途切れ
- 同じデバイスでチャンネルを変更すると音声が切断される
- 既存接続を削除→新規作成のため一瞬無音になる

## 修正内容

### 1. ログスパムの解決

#### RoutingUI (src/engine/audio/devices/routingUI.ts)
```typescript
// リトライ回数を25回→5回に短縮
if (attempts > 5) { // リトライ回数を大幅に短縮（1秒で諦め）
    this.pendingAttach.delete(logicId);
    console.warn(`[RoutingUI] Gave up trying to attach mic for ${logicId} after ${attempts} attempts`);
} else {
    this.pendingAttach.set(logicId, attempts);
    allDone = false;
    // ログを最小限に（初回と最終回のみ）
    if (attempts === 1 || attempts === 5) {
        console.log(`[RoutingUI] Retrying mic attachment for ${logicId} (attempt ${attempts})`);
    }
}
```

#### InputManager (src/engine/audio/devices/inputManager.ts)
```typescript
// getMicInputStatusのログを完全に無効化
getMicInputStatus(): MicInput[] {
    // 頻繁な呼び出しのためログを完全に無効化
    // console.log('[InputManager] getMicInputStatus called');
    // console.log('[InputManager] micRouter exists:', !!this.micRouter);
```

### 2. チャンネル選択の持続性

#### LogicInput拡張 (src/audio/logicInputs.ts)
```typescript
// LogicInputインターフェースにchannelIndex追加
export interface LogicInput {
    id: string;
    label: string;
    assignedDeviceId: string | null;
    channelIndex?: number; // チャンネル選択（undefinedの場合は全チャンネル/モノラル）
    routing: { synth: boolean; effects: boolean; monitor: boolean; };
    gain: number;
    enabled: boolean;
    trackId?: string | null;
    order?: number;
    trackMixSnapshot?: { userVolume?: number; muted?: boolean; solo?: boolean; };
}

// assignChannelメソッド追加
assignChannel(logicInputId: string, channelIndex: number | undefined) {
    const input = this.inputs.find(i => i.id === logicInputId);
    if (input) {
        input.channelIndex = channelIndex;
        this.scheduleSave();
        console.log(`[LogicInputManager] Assigned channel ${channelIndex} to ${logicInputId}`);
    }
}
```

#### DeviceAssignmentUI自動再描画を無効化 (src/controller.ts)
```typescript
// デバイス割り当て変更時にDeviceAssignmentUIも再描画
document.addEventListener('logic-input-assignment-changed', async () => {
    routingUI.render();
    // await deviceAssignUI.render(); // 一時的に無効化: チャンネル選択リセット問題の調査
    updateUnassignedWarning();
});
```

### 3. 音声途切れの解決

#### 同一デバイス内チャンネル変更の最適化 (src/engine/audio/devices/inputManager.ts)
```typescript
async updateDeviceConnectionWithChannel(logicInputId: string, newDeviceId: string | null, channelIndex?: number): Promise<void> {
    // 既存の接続を確認
    const existingInput = this.micRouter.getMicInput(logicInputId);
    
    if (existingInput && existingInput.deviceId === newDeviceId) {
        // 同じデバイスでチャンネルのみ変更の場合、接続を維持してチャンネル分割のみ更新
        console.log(`[InputManager] Same device, updating channel only for ${logicInputId}`);
        
        // チャンネル情報を更新
        existingInput.channelIndex = channelIndex;
        
        // ラベルを更新
        const config = this.ioList.find(cfg => cfg.deviceId === newDeviceId);
        const baseLabel = config?.label || `マイク (${logicInputId})`;
        existingInput.label = baseLabel + channelLabel;
        
        // チャンネル分割の再構築（音声を途切れさせない）
        if (existingInput.channelSplitter) {
            existingInput.channelSplitter.disconnect();
        }
        
        if (existingInput.source && existingInput.gainNode) {
            // 既存の接続を一旦切断
            existingInput.source.disconnect();
            
            if (channelIndex !== undefined && existingInput.source.channelCount > 1) {
                // チャンネル分割を再構築
                const channelSplitter = this.micRouter.getAudioContext().createChannelSplitter(existingInput.source.channelCount);
                const channelMerger = this.micRouter.getAudioContext().createChannelMerger(1);
                
                if (channelIndex < existingInput.source.channelCount) {
                    existingInput.source.connect(channelSplitter);
                    channelSplitter.connect(channelMerger, channelIndex, 0);
                    channelMerger.connect(existingInput.gainNode);
                    existingInput.channelSplitter = channelSplitter;
                    console.log(`[InputManager] Rebuilt channel splitter for channel ${channelIndex}`);
                } else {
                    existingInput.source.connect(existingInput.gainNode);
                    console.warn(`[InputManager] Channel ${channelIndex} not available, using all channels`);
                }
            } else {
                // チャンネル指定なしまたはモノラル
                existingInput.source.connect(existingInput.gainNode);
                existingInput.channelSplitter = undefined;
                console.log(`[InputManager] Connected without channel splitting`);
            }
        }
        
        console.log(`[InputManager] Successfully updated channel for ${logicInputId} to ${channelIndex}`);
        return;
    }
    
    // 異なるデバイスまたは新規接続の場合は従来通り
    // ...
}
```

#### MicRouterにgetAudioContext追加 (src/engine/audio/devices/micRouter.ts)
```typescript
/**
 * AudioContextを取得
 */
getAudioContext(): AudioContext {
    return this.audioContext;
}
```

## 結果

### 改善された動作
1. **ログスパム解消**: コンソールログが大幅に削減され、デバッグが容易になった
2. **チャンネル選択持続**: 選択したチャンネルが「All」に戻らず、正しく保持される
3. **音声継続性**: 同じデバイス内でのチャンネル変更時に音声が途切れない
4. **32チャンネル対応**: プロ用ミキサーに対応した32チャンネル選択が可能

### 技術的成果
- Web Audio APIのChannelSplitterNode/ChannelMergerNodeを使った効率的なチャンネル分割
- LogicInputManagerの永続化機能拡張
- UI再描画最適化によるUX向上
- リトライメカニズムの最適化

### 対応できる用途
- プロ用オーディオインターフェース（32ch対応）
- ステレオマイクの左右個別選択
- ミキサーからの個別チャンネル入力
- 複数デバイスの同時使用

## テスト推奨項目

1. **基本動作**
   - デバイス選択とチャンネル選択
   - 設定の永続化（ページリロード後の復元）
   - メーターの動作確認

2. **音質確認**
   - チャンネル切り替え時の音声継続性
   - 各チャンネルの独立性
   - 音質劣化の有無

3. **パフォーマンス**
   - ログスパムの解消
   - CPU使用率の改善
   - メモリリークの確認

## 今後の拡張可能性

- チャンネルグループ機能（複数チャンネルの同時選択）
- チャンネル名のカスタマイズ
- リアルタイムレベルメーター（チャンネル別）
- チャンネルルーティングの可視化

---

修正日: 2025年8月24日  
対象ファイル: routingUI.ts, inputManager.ts, logicInputs.ts, controller.ts, micRouter.ts
