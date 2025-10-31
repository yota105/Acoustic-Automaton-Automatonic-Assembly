# Cross-Page State Synchronization
**ページ間状態同期システム設計**

## 問題の整理

### 問題1: Input接続の不安定性
**現象:**
- Logic Inputでデバイスを選択しても、入力できたりできなかったりする
- デバイス接続が不確実
- チャンネル選択が正しく機能しない場合がある

**原因分析:**
1. **非同期処理の競合**
   - `getUserMedia()` の非同期処理中に別の接続要求が発生
   - MicRouter の接続/切断が競合する
   - AudioContext の state が不安定 (suspended/running)

2. **デバイスパーミッションの問題**
   - ブラウザのマイク権限が未承認または拒否されている
   - 同じデバイスを複数回要求すると失敗する
   - デバイスIDが変更される (プラグ抜き差し等)

3. **接続状態の管理不足**
   - 既存接続の適切なクリーンアップができていない
   - 接続試行のリトライロジックがない
   - エラーハンドリングが不十分

### 問題2: Performance/Controller間の設定共有
**要件:**
- PerformanceとControllerで設定を共有
- ルーティング設定の統一
- Track設定の統一
- ページ移動しても音が鳴り続ける
- 曲が中断されない

**現在の問題:**
- 各ページが独立した状態を持つ
- ページ遷移時にAudioContext/Track/Routingがリセットされる
- 設定の永続化がない
- ページ間通信が限定的 (BroadcastChannelのみ)

---

## 解決策1: Input接続の安定化

### A. 接続マネージャーの実装

```typescript
// src/engine/audio/devices/connectionManager.ts

export interface ConnectionRequest {
    logicInputId: string;
    deviceId: string | null;
    channelIndex?: number;
    priority: number; // 優先度
    timestamp: number;
}

export class ConnectionManager {
    private pendingRequests: Map<string, ConnectionRequest> = new Map();
    private activeConnections: Map<string, MicInput> = new Map();
    private isProcessing = false;
    private requestQueue: ConnectionRequest[] = [];

    /**
     * 接続リクエストをキューに追加
     */
    async requestConnection(
        logicInputId: string,
        deviceId: string | null,
        channelIndex?: number,
        priority = 0
    ): Promise<boolean> {
        const request: ConnectionRequest = {
            logicInputId,
            deviceId,
            channelIndex,
            priority,
            timestamp: Date.now()
        };

        // 既存リクエストをキャンセル
        if (this.pendingRequests.has(logicInputId)) {
            console.log(`[ConnectionManager] Canceling pending request for ${logicInputId}`);
            this.pendingRequests.delete(logicInputId);
        }

        this.pendingRequests.set(logicInputId, request);
        this.requestQueue.push(request);

        // 優先度でソート (高い順)
        this.requestQueue.sort((a, b) => b.priority - a.priority);

        return await this.processQueue();
    }

    /**
     * キューを順次処理
     */
    private async processQueue(): Promise<boolean> {
        if (this.isProcessing) {
            console.log('[ConnectionManager] Already processing, queued for later');
            return true;
        }

        this.isProcessing = true;

        try {
            while (this.requestQueue.length > 0) {
                const request = this.requestQueue.shift()!;

                // 古いリクエストはスキップ (5秒以上経過)
                if (Date.now() - request.timestamp > 5000) {
                    console.warn(`[ConnectionManager] Skipping stale request for ${request.logicInputId}`);
                    this.pendingRequests.delete(request.logicInputId);
                    continue;
                }

                // 接続実行 (リトライ付き)
                const success = await this.executeConnection(request);

                if (success) {
                    this.pendingRequests.delete(request.logicInputId);
                } else {
                    // 失敗時は再キュー (最大3回)
                    if ((request as any).retryCount === undefined) {
                        (request as any).retryCount = 0;
                    }
                    if ((request as any).retryCount < 3) {
                        (request as any).retryCount++;
                        console.log(`[ConnectionManager] Retrying ${request.logicInputId} (attempt ${(request as any).retryCount})`);
                        this.requestQueue.push(request);
                        // 少し待つ
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        console.error(`[ConnectionManager] Failed after 3 retries: ${request.logicInputId}`);
                        this.pendingRequests.delete(request.logicInputId);
                    }
                }
            }

            return true;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 接続を実行
     */
    private async executeConnection(request: ConnectionRequest): Promise<boolean> {
        const { logicInputId, deviceId, channelIndex } = request;

        try {
            console.log(`[ConnectionManager] Executing connection: ${logicInputId} -> ${deviceId}`);

            // AudioContextの確認
            if (!window.audioCtx) {
                console.warn('[ConnectionManager] AudioContext not ready, deferring');
                return false;
            }

            // AudioContextが suspended なら resume
            if (window.audioCtx.state === 'suspended') {
                console.log('[ConnectionManager] Resuming AudioContext');
                await window.audioCtx.resume();
            }

            // InputManagerで接続
            const inputManager = window.inputManager;
            if (!inputManager) {
                console.error('[ConnectionManager] InputManager not available');
                return false;
            }

            // 既存接続のクリーンアップ
            const existingConnection = this.activeConnections.get(logicInputId);
            if (existingConnection) {
                console.log(`[ConnectionManager] Cleaning up existing connection for ${logicInputId}`);
                await this.cleanupConnection(logicInputId);
                // クリーンアップ後、少し待つ
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // 新規接続
            await inputManager.updateDeviceConnectionWithChannel(logicInputId, deviceId, channelIndex);

            // 接続確認
            const micRouter = inputManager.getMicRouter();
            if (micRouter) {
                const micInput = micRouter.getMicInput(logicInputId);
                if (micInput && micInput.gainNode) {
                    this.activeConnections.set(logicInputId, micInput);
                    console.log(`[ConnectionManager] ✅ Successfully connected ${logicInputId}`);

                    // 接続成功イベント発火
                    document.dispatchEvent(new CustomEvent('connection-established', {
                        detail: { logicInputId, deviceId, channelIndex }
                    }));

                    return true;
                } else {
                    console.error(`[ConnectionManager] Connection failed verification for ${logicInputId}`);
                    return false;
                }
            }

            return false;

        } catch (error) {
            console.error(`[ConnectionManager] Connection failed for ${logicInputId}:`, error);

            // パーミッションエラーの場合、ユーザーに通知
            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                this.showPermissionError(logicInputId);
            }

            return false;
        }
    }

    /**
     * 接続をクリーンアップ
     */
    private async cleanupConnection(logicInputId: string): Promise<void> {
        const connection = this.activeConnections.get(logicInputId);
        if (!connection) return;

        try {
            // ストリームを停止
            if (connection.stream) {
                connection.stream.getTracks().forEach(track => track.stop());
            }

            // AudioNodeを切断
            if (connection.gainNode) {
                connection.gainNode.disconnect();
            }
            if (connection.source) {
                connection.source.disconnect();
            }
            if (connection.channelSplitter) {
                connection.channelSplitter.disconnect();
            }

            this.activeConnections.delete(logicInputId);

            console.log(`[ConnectionManager] Cleaned up connection: ${logicInputId}`);
        } catch (error) {
            console.error(`[ConnectionManager] Cleanup error for ${logicInputId}:`, error);
        }
    }

    /**
     * パーミッションエラー表示
     */
    private showPermissionError(logicInputId: string): void {
        const message = `マイクのアクセス権限が拒否されています。\n\n` +
            `ブラウザの設定でマイクの使用を許可してください。\n` +
            `(Logic Input: ${logicInputId})`;

        console.error(message);

        // UI通知 (既存のログシステムを使用)
        const logElement = document.getElementById('debug-log');
        if (logElement) {
            logElement.textContent += `\n[ERROR] ${message}\n`;
        }

        // モーダル表示も検討
        alert(message);
    }

    /**
     * すべての接続をクリーンアップ
     */
    async dispose(): Promise<void> {
        for (const logicInputId of this.activeConnections.keys()) {
            await this.cleanupConnection(logicInputId);
        }
        this.requestQueue = [];
        this.pendingRequests.clear();
    }
}
```

### B. InputManagerへの統合

```typescript
// src/engine/audio/devices/inputManager.ts の修正

import { ConnectionManager } from './connectionManager';

export class InputManager {
    private connectionManager: ConnectionManager;

    constructor() {
        // ...existing code...
        this.connectionManager = new ConnectionManager();
    }

    async updateDeviceConnectionWithChannel(
        logicInputId: string,
        newDeviceId: string | null,
        channelIndex?: number
    ): Promise<void> {
        // ConnectionManagerを使用
        await this.connectionManager.requestConnection(
            logicInputId,
            newDeviceId,
            channelIndex,
            1 // 通常優先度
        );
    }

    dispose(): void {
        this.connectionManager.dispose();
        // ...existing cleanup...
    }
}
```

---

## 解決策2: ページ間状態同期システム

### A. SharedStateManager の実装

```typescript
// src/engine/state/sharedStateManager.ts

export interface AudioEngineState {
    // AudioContext状態
    audioContext: {
        sampleRate: number;
        state: AudioContextState;
        currentTime: number;
    };

    // Track状態
    tracks: Array<{
        id: string;
        kind: TrackKind;
        name: string;
        volume: number;
        routing: { synth: boolean; effects: boolean; monitor: boolean };
        enabled: boolean;
    }>;

    // Logic Input状態
    logicInputs: Array<{
        id: string;
        label: string;
        assignedDeviceId: string | null;
        channelIndex?: number;
        enabled: boolean;
        routing: { synth: boolean; effects: boolean; monitor: boolean };
        gain: number;
    }>;

    // Routing状態
    routing: {
        mainOutput: boolean;
        monitorOutputs: {
            performer1: boolean;
            performer2: boolean;
            performer3: boolean;
        };
    };

    // Performance状態
    performance: {
        isPlaying: boolean;
        isPaused: boolean;
        currentTime: number;
        currentSection: string | null;
    };
}

export class SharedStateManager {
    private static readonly STORAGE_KEY = 'acoustic-automaton-state';
    private static readonly BROADCAST_CHANNEL = 'acoustic-automaton-sync';

    private broadcastChannel?: BroadcastChannel;
    private state: AudioEngineState;
    private listeners: Map<string, Set<(state: AudioEngineState) => void>> = new Map();

    constructor() {
        // 初期状態をlocalStorageから復元
        this.state = this.loadState();

        // BroadcastChannelでページ間通信
        this.setupBroadcastChannel();

        // 定期的にlocalStorageへ保存 (1秒ごと)
        setInterval(() => this.saveState(), 1000);
    }

    /**
     * 状態をlocalStorageから読み込み
     */
    private loadState(): AudioEngineState {
        try {
            const stored = localStorage.getItem(SharedStateManager.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('[SharedStateManager] Loaded state from localStorage');
                return parsed;
            }
        } catch (error) {
            console.error('[SharedStateManager] Failed to load state:', error);
        }

        // デフォルト状態
        return this.getDefaultState();
    }

    /**
     * 状態をlocalStorageへ保存
     */
    private saveState(): void {
        try {
            const serialized = JSON.stringify(this.state);
            localStorage.setItem(SharedStateManager.STORAGE_KEY, serialized);
        } catch (error) {
            console.error('[SharedStateManager] Failed to save state:', error);
        }
    }

    /**
     * デフォルト状態を取得
     */
    private getDefaultState(): AudioEngineState {
        return {
            audioContext: {
                sampleRate: 44100,
                state: 'suspended',
                currentTime: 0
            },
            tracks: [],
            logicInputs: [],
            routing: {
                mainOutput: true,
                monitorOutputs: {
                    performer1: false,
                    performer2: false,
                    performer3: false
                }
            },
            performance: {
                isPlaying: false,
                isPaused: false,
                currentTime: 0,
                currentSection: null
            }
        };
    }

    /**
     * BroadcastChannel初期化
     */
    private setupBroadcastChannel(): void {
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('[SharedStateManager] BroadcastChannel not supported');
            return;
        }

        this.broadcastChannel = new BroadcastChannel(SharedStateManager.BROADCAST_CHANNEL);

        this.broadcastChannel.onmessage = (event) => {
            const { type, payload } = event.data;

            switch (type) {
                case 'state-update':
                    this.handleRemoteStateUpdate(payload);
                    break;
                case 'state-request':
                    this.broadcastState();
                    break;
            }
        };

        console.log('[SharedStateManager] BroadcastChannel initialized');

        // 起動時に他のページへ状態を要求
        this.requestState();
    }

    /**
     * 他のページへ現在の状態を要求
     */
    private requestState(): void {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({ type: 'state-request' });
        }
    }

    /**
     * 現在の状態をブロードキャスト
     */
    private broadcastState(): void {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                type: 'state-update',
                payload: this.state
            });
        }
    }

    /**
     * リモートからの状態更新を処理
     */
    private handleRemoteStateUpdate(remoteState: AudioEngineState): void {
        console.log('[SharedStateManager] Received remote state update');

        // タイムスタンプ比較などで最新の状態を採用
        // ここでは単純に上書き (後で改善可能)
        this.state = remoteState;

        // リスナーへ通知
        this.notifyListeners();

        // 実際のAudioEngine状態を更新
        this.applyStateToEngine();
    }

    /**
     * 状態をAudioEngineへ適用
     */
    private applyStateToEngine(): void {
        // Tracksを復元
        if (window.trackLifecycleManager) {
            this.state.tracks.forEach(trackState => {
                // Trackが存在しない場合、作成
                const existingTrack = listTracks().find(t => t.id === trackState.id);
                if (!existingTrack) {
                    console.log(`[SharedStateManager] Recreating track: ${trackState.id}`);
                    // Track作成ロジック (TrackLifecycleManager使用)
                }

                // Track設定を適用
                if (existingTrack) {
                    existingTrack.userVolume = trackState.volume;
                    existingTrack.volumeGain.gain.value = trackState.volume;
                }
            });
        }

        // Logic Inputsを復元
        if (window.logicInputManagerInstance) {
            this.state.logicInputs.forEach(inputState => {
                const input = window.logicInputManagerInstance.get(inputState.id);
                if (input) {
                    input.enabled = inputState.enabled;
                    input.routing = inputState.routing;
                    input.gain = inputState.gain;
                    // デバイス接続は別途処理 (ConnectionManager使用)
                }
            });
        }

        console.log('[SharedStateManager] Applied state to audio engine');
    }

    /**
     * 状態を更新してブロードキャスト
     */
    updateState(partial: Partial<AudioEngineState>): void {
        this.state = { ...this.state, ...partial };
        this.saveState();
        this.broadcastState();
        this.notifyListeners();
    }

    /**
     * Track状態を更新
     */
    updateTrack(trackId: string, updates: Partial<AudioEngineState['tracks'][0]>): void {
        const trackIndex = this.state.tracks.findIndex(t => t.id === trackId);
        if (trackIndex >= 0) {
            this.state.tracks[trackIndex] = { ...this.state.tracks[trackIndex], ...updates };
        } else {
            this.state.tracks.push(updates as AudioEngineState['tracks'][0]);
        }

        this.saveState();
        this.broadcastState();
        this.notifyListeners();
    }

    /**
     * Logic Input状態を更新
     */
    updateLogicInput(inputId: string, updates: Partial<AudioEngineState['logicInputs'][0]>): void {
        const inputIndex = this.state.logicInputs.findIndex(i => i.id === inputId);
        if (inputIndex >= 0) {
            this.state.logicInputs[inputIndex] = { ...this.state.logicInputs[inputIndex], ...updates };
        } else {
            this.state.logicInputs.push(updates as AudioEngineState['logicInputs'][0]);
        }

        this.saveState();
        this.broadcastState();
        this.notifyListeners();
    }

    /**
     * 状態変更リスナーを登録
     */
    subscribe(callback: (state: AudioEngineState) => void): () => void {
        const id = Math.random().toString(36);
        if (!this.listeners.has('state-change')) {
            this.listeners.set('state-change', new Set());
        }
        this.listeners.get('state-change')!.add(callback);

        // アンサブスクライブ関数を返す
        return () => {
            this.listeners.get('state-change')?.delete(callback);
        };
    }

    /**
     * リスナーへ通知
     */
    private notifyListeners(): void {
        const listeners = this.listeners.get('state-change');
        if (listeners) {
            listeners.forEach(callback => callback(this.state));
        }
    }

    /**
     * 現在の状態を取得
     */
    getState(): AudioEngineState {
        return { ...this.state };
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        this.listeners.clear();
    }
}

// グローバルインスタンス
export const sharedStateManager = new SharedStateManager();
```

### B. AudioEngineとの統合

```typescript
// src/engine/audio/core/audioCore.ts への統合

import { sharedStateManager } from '../../state/sharedStateManager';

export async function ensureBaseAudio(): Promise<void> {
    // ...existing code...

    // 状態を復元
    const state = sharedStateManager.getState();

    // Logic Inputsを復元
    state.logicInputs.forEach(inputState => {
        // 接続を復元
        if (inputState.assignedDeviceId) {
            window.inputManager?.updateDeviceConnectionWithChannel(
                inputState.id,
                inputState.assignedDeviceId,
                inputState.channelIndex
            );
        }
    });

    // Tracksを復元
    state.tracks.forEach(trackState => {
        // Track再作成
        // ...
    });

    // 状態変更をリッスン
    sharedStateManager.subscribe((newState) => {
        console.log('[audioCore] State updated from other page');
        // 必要に応じて再適用
    });
}
```

---

## 実装手順

### Phase 1: Input安定化
- [x] 問題分析完了
- [ ] ConnectionManager実装
- [ ] InputManagerへの統合
- [ ] リトライロジック追加
- [ ] パーミッションエラーハンドリング
- [ ] テスト・デバッグ

### Phase 2: 状態同期システム
- [x] 要件定義完了
- [ ] SharedStateManager実装
- [ ] localStorage連携
- [ ] BroadcastChannel統合
- [ ] AudioEngineとの統合
- [ ] Performance/Controller統合

### Phase 3: シームレスなページ遷移
- [ ] AudioContext永続化
- [ ] Track状態の保持
- [ ] ページ遷移時の音楽継続
- [ ] UI状態の同期

---

## テスト計画

### Input安定化テスト
- [ ] デバイス接続の成功率測定
- [ ] チャンネル選択の正確性確認
- [ ] エラー時のリトライ動作確認
- [ ] パーミッション拒否時の挙動確認

### 状態同期テスト
- [ ] Controller→Performance の状態反映確認
- [ ] Performance→Controller の状態反映確認
- [ ] ページリロード時の状態復元確認
- [ ] 複数タブ同時操作の競合テスト

---

## 将来の拡張

### オフライン対応
- IndexedDB使用で大量データ保存
- ServiceWorkerによる永続化

### ネットワーク同期
- WebSocket経由で複数デバイス同期
- リアルタイム協調演奏対応

### バージョン管理
- 状態のバージョニング
- マイグレーションスクリプト
