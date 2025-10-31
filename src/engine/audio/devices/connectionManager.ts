/**
 * ConnectionManager - Logic Input接続の安定化
 * 
 * getUserMedia()の非同期処理競合を回避し、安定した接続を提供
 * リトライロジック、優先度付きキューイング、パーミッションエラーハンドリングを実装
 */

import { MicInput } from './micRouter';

// InputManagerへの参照型 (循環参照を避けるため型のみ宣言)
export interface IInputManager {
    _executeDeviceConnection(logicInputId: string, deviceId: string | null, channelIndex?: number): Promise<void>;
}

export interface ConnectionRequest {
    logicInputId: string;
    deviceId: string | null;
    channelIndex?: number;
    priority: number; // 優先度 (高いほど優先)
    timestamp: number;
    retryCount?: number; // リトライ回数
}

export class ConnectionManager {
    private pendingRequests: Map<string, ConnectionRequest> = new Map();
    private activeConnections: Map<string, MicInput> = new Map();
    private isProcessing = false;
    private requestQueue: ConnectionRequest[] = [];
    private maxRetries = 3;
    private inputManager: IInputManager | null = null;

    /**
     * InputManagerを設定 (初期化時に呼び出す)
     */
    setInputManager(inputManager: IInputManager): void {
        this.inputManager = inputManager;
    }

    /**
     * 接続リクエストをキューに追加
     */
    async requestConnection(
        logicInputId: string,
        deviceId: string | null,
        channelIndex?: number,
        priority = 0
    ): Promise<boolean> {
        console.log(`📨 [ConnectionManager.requestConnection] Received request:`);
        console.log(`   - Logic Input: ${logicInputId}`);
        console.log(`   - Device ID: ${deviceId}`);
        console.log(`   - Channel: ${channelIndex !== undefined ? `CH${channelIndex + 1}` : 'Mono/All'}`);
        console.log(`   - Priority: ${priority}`);

        const request: ConnectionRequest = {
            logicInputId,
            deviceId,
            channelIndex,
            priority,
            timestamp: Date.now(),
            retryCount: 0
        };

        // 既存リクエストをキャンセル
        if (this.pendingRequests.has(logicInputId)) {
            console.log(`[ConnectionManager] Canceling pending request for ${logicInputId}`);
            this.pendingRequests.delete(logicInputId);
            // キューからも削除
            this.requestQueue = this.requestQueue.filter(r => r.logicInputId !== logicInputId);
        }

        this.pendingRequests.set(logicInputId, request);
        this.requestQueue.push(request);

        // 優先度でソート (高い順)
        this.requestQueue.sort((a, b) => b.priority - a.priority);

        console.log(`[ConnectionManager] Queued connection request: ${logicInputId} -> ${deviceId} (priority: ${priority})`);
        console.log(`[ConnectionManager] Queue length: ${this.requestQueue.length}`);

        // キュー処理を開始 (非同期)
        this.processQueue();

        return true;
    }

    /**
     * キューを順次処理
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            console.log('[ConnectionManager] Already processing, queued for later');
            return;
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
                    console.log(`[ConnectionManager] ✅ Connection successful: ${request.logicInputId}`);
                } else {
                    // 失敗時は再キュー (最大3回)
                    if (request.retryCount! < this.maxRetries) {
                        request.retryCount!++;
                        console.log(`[ConnectionManager] Retrying ${request.logicInputId} (attempt ${request.retryCount}/${this.maxRetries})`);
                        this.requestQueue.push(request);
                        // 少し待つ
                        await new Promise(resolve => setTimeout(resolve, 1000 * request.retryCount!));
                    } else {
                        console.error(`[ConnectionManager] ❌ Failed after ${this.maxRetries} retries: ${request.logicInputId}`);
                        this.pendingRequests.delete(request.logicInputId);

                        // 失敗イベント発火
                        this.dispatchConnectionEvent('connection-failed', {
                            logicInputId: request.logicInputId,
                            deviceId: request.deviceId,
                            reason: 'max-retries-exceeded'
                        });
                    }
                }
            }
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
                // resume後、少し待つ
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // InputManagerで接続実行
            if (!this.inputManager) {
                console.error('[ConnectionManager] InputManager not configured');
                return false;
            }

            // 既存接続のクリーンアップ（同デバイス・チャンネル変更のみの場合はスキップ）
            const existingConnection = this.activeConnections.get(logicInputId);
            if (existingConnection) {
                // 同じデバイスへのチャンネル更新かチェック
                const isSameDevice = existingConnection.deviceId === deviceId;
                if (isSameDevice) {
                    console.log(`[ConnectionManager] Same device detected for ${logicInputId}, skipping cleanup for channel update`);
                } else {
                    console.log(`[ConnectionManager] Cleaning up existing connection for ${logicInputId}`);
                    await this.cleanupConnection(logicInputId);
                    // クリーンアップ後、少し待つ
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // InputManagerの内部メソッドで接続実行
            await this.inputManager._executeDeviceConnection(logicInputId, deviceId, channelIndex);

            // deviceId が null の場合は切断なので成功として扱う
            if (!deviceId) {
                console.log(`[ConnectionManager] ✅ Successfully disconnected ${logicInputId}`);
                this.activeConnections.delete(logicInputId);
                return true;
            }

            // 接続確認
            const inputManager = window.inputManager;
            if (inputManager) {
                const micRouter = inputManager.getMicRouter();
                if (micRouter) {
                    const micInput = micRouter.getMicInput(logicInputId);
                    if (micInput && micInput.gainNode) {
                        this.activeConnections.set(logicInputId, micInput);
                        console.log(`[ConnectionManager] ✅ Successfully connected ${logicInputId}`);

                        // 接続成功イベント発火
                        this.dispatchConnectionEvent('connection-established', {
                            logicInputId,
                            deviceId,
                            channelIndex
                        });

                        return true;
                    } else {
                        console.error(`[ConnectionManager] Connection failed verification for ${logicInputId}`);
                        return false;
                    }
                }
            }

            return false;

        } catch (error) {
            console.error(`[ConnectionManager] Connection failed for ${logicInputId}:`, error);

            // パーミッションエラーの場合、ユーザーに通知
            if (error instanceof DOMException) {
                if (error.name === 'NotAllowedError') {
                    this.showPermissionError(logicInputId);
                    // パーミッションエラーはリトライしない
                    this.pendingRequests.delete(logicInputId);
                } else if (error.name === 'NotFoundError') {
                    console.error(`[ConnectionManager] Device not found for ${logicInputId}`);
                } else if (error.name === 'NotReadableError') {
                    console.error(`[ConnectionManager] Device already in use for ${logicInputId}`);
                }
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
                connection.stream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`[ConnectionManager] Stopped track for ${logicInputId}`);
                });
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

        // イベント発火
        this.dispatchConnectionEvent('permission-denied', {
            logicInputId,
            message
        });
    }

    /**
     * 接続イベントを発火
     */
    private dispatchConnectionEvent(eventType: string, detail: any): void {
        document.dispatchEvent(new CustomEvent(eventType, { detail }));
    }

    /**
     * すべての接続をクリーンアップ
     */
    async dispose(): Promise<void> {
        console.log('[ConnectionManager] Disposing all connections');

        for (const logicInputId of this.activeConnections.keys()) {
            await this.cleanupConnection(logicInputId);
        }

        this.requestQueue = [];
        this.pendingRequests.clear();

        console.log('[ConnectionManager] Disposed');
    }

    /**
     * デバッグ情報取得
     */
    getDebugInfo(): {
        pendingRequests: number;
        activeConnections: number;
        queueLength: number;
        isProcessing: boolean;
    } {
        return {
            pendingRequests: this.pendingRequests.size,
            activeConnections: this.activeConnections.size,
            queueLength: this.requestQueue.length,
            isProcessing: this.isProcessing
        };
    }
}
