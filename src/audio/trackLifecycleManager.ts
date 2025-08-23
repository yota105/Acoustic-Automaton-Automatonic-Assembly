// Track Lifecycle Manager: 安全なTrack生成・破棄システム
// Phase 2: Faust WASM統合からTrack管理システムへの完全統合

import { Track, TrackKind, createGenericTrack, addTrack, removeTrack, listTracks } from './tracks';
import { LogicInput } from './logicInputs';
import { createEffectInstance, EffectInstance } from './effects/effectRegistry';

export interface TrackConfig {
    id?: string;
    name: string;
    kind: TrackKind;
    initialVolume?: number;
    dspConfig?: {
        effectRefId: string;
        parameters?: Record<string, number>;
    };
    logicInputId?: string; // 関連付けるLogicInput ID
}

export interface TrackCreationResult {
    track: Track;
    effectInstance?: EffectInstance;
    success: boolean;
    error?: string;
}

// フェード時間定数
const FADE_IN_TIME = 0.015; // 15ms
const FADE_OUT_TIME = 0.02;  // 20ms
const CLEANUP_DELAY = 30;    // 30ms余裕

export class TrackLifecycleManager {
    private static instance: TrackLifecycleManager;
    private audioContext?: AudioContext;
    private pendingCreations = new Map<string, Promise<TrackCreationResult>>();

    private constructor() { }

    static getInstance(): TrackLifecycleManager {
        if (!TrackLifecycleManager.instance) {
            TrackLifecycleManager.instance = new TrackLifecycleManager();
        }
        return TrackLifecycleManager.instance;
    }

    /**
     * AudioContextを設定
     */
    setAudioContext(ctx: AudioContext): void {
        this.audioContext = ctx;
    }

    /**
     * 安全なTrack生成（クリックノイズ防止）
     */
    async createTrackSafely(config: TrackConfig): Promise<TrackCreationResult> {
        // フォールバック: 外部で setAudioContext 呼ばれていない場合 window.audioCtx があれば利用
        if (!this.audioContext && (window as any).audioCtx instanceof AudioContext) {
            this.audioContext = (window as any).audioCtx;
            console.log('[TrackLifecycleManager] Adopted global audioCtx');
        }
        if (!this.audioContext) {
            console.warn('[TrackLifecycleManager] AudioContext not set. Call trackLifecycleManager.setAudioContext(audioCtx) after ensureBaseAudio().');
            return {
                track: null as any,
                success: false,
                error: 'AudioContext not set (call setAudioContext after ensureBaseAudio)'
            };
        }

        // 重複作成防止
        const pendingKey = config.id || `${config.kind}_${config.name}`;
        if (this.pendingCreations.has(pendingKey)) {
            console.log(`🔄 Track creation already pending: ${pendingKey}`);
            return await this.pendingCreations.get(pendingKey)!;
        }

        const creationPromise = this._createTrackInternal(config);
        this.pendingCreations.set(pendingKey, creationPromise);

        try {
            const result = await creationPromise;
            this.pendingCreations.delete(pendingKey);
            return result;
        } catch (error) {
            this.pendingCreations.delete(pendingKey);
            throw error;
        }
    }

    /**
     * 内部Track生成処理
     */
    private async _createTrackInternal(config: TrackConfig): Promise<TrackCreationResult> {
        const ctx = this.audioContext!;
        console.log(`🏗️ Creating track: ${config.name} (${config.kind})`);

        try {
            let effectInstance: EffectInstance | undefined;

            // Faust DSPの場合はEffectInstanceを作成
            if (config.kind === 'faust' && config.dspConfig) {
                console.log(`🎛️ Creating Faust effect: ${config.dspConfig.effectRefId}`);
                effectInstance = await createEffectInstance(config.dspConfig.effectRefId, ctx);

                // パラメータ初期値設定
                if (config.dspConfig.parameters && effectInstance.controller) {
                    for (const [param, value] of Object.entries(config.dspConfig.parameters)) {
                        effectInstance.controller.setParam(param, value);
                    }
                }
            }

            // Track作成
            const track = createGenericTrack({
                id: config.id,
                name: config.name,
                kind: config.kind,
                audioContext: ctx,
                effectInstance
            });

            // 初期音量設定（無音から開始）
            track.volumeGain.gain.setValueAtTime(0, ctx.currentTime);
            track.userVolume = config.initialVolume ?? 1;

            // Trackをリストに追加
            addTrack(track);

            // フェードインによる安全な音声開始
            await this._fadeInTrack(track);

            console.log(`✅ Track created successfully: ${track.id}`);

            return {
                track,
                effectInstance,
                success: true
            };

        } catch (error) {
            console.error(`❌ Track creation failed:`, error);
            return {
                track: null as any,
                success: false,
                error: `Track creation failed: ${error}`
            };
        }
    }

    /**
     * Track安全なフェードイン
     */
    private async _fadeInTrack(track: Track): Promise<void> {
        const ctx = this.audioContext!;
        const targetVolume = track.userVolume ?? 1;

        // LinearRampでフェードイン
        track.volumeGain.gain.linearRampToValueAtTime(
            targetVolume,
            ctx.currentTime + FADE_IN_TIME
        );

        console.log(`🎵 Track ${track.id} fading in to volume ${targetVolume}`);

        // フェード完了まで待機
        return new Promise(resolve => {
            setTimeout(resolve, FADE_IN_TIME * 1000 + 5);
        });
    }

    /**
     * Track安全な破棄（フェードアウト付き）
     */
    async dismissTrackSafely(trackId: string): Promise<boolean> {
        if (!this.audioContext) {
            console.warn('⚠️ AudioContext not available for track dismissal');
            return false;
        }

        const track = listTracks().find(t => t.id === trackId);
        if (!track) {
            console.warn(`⚠️ Track not found: ${trackId}`);
            return false;
        }

        console.log(`🗑️ Dismissing track safely: ${trackId}`);

        try {
            // フェードアウト
            await this._fadeOutTrack(track);

            // Track削除
            removeTrack(trackId);

            // 関連LogicInputのtrackId解除
            this._unlinkLogicInput(trackId);

            console.log(`✅ Track dismissed successfully: ${trackId}`);
            return true;

        } catch (error) {
            console.error(`❌ Track dismissal failed:`, error);
            return false;
        }
    }

    /**
     * Track安全なフェードアウト
     */
    private async _fadeOutTrack(track: Track): Promise<void> {
        const ctx = this.audioContext!;

        // LinearRampでフェードアウト
        track.volumeGain.gain.linearRampToValueAtTime(
            0,
            ctx.currentTime + FADE_OUT_TIME
        );

        console.log(`🔇 Track ${track.id} fading out`);

        // フェード完了まで待機
        return new Promise(resolve => {
            setTimeout(resolve, FADE_OUT_TIME * 1000 + CLEANUP_DELAY);
        });
    }

    /**
     * LogicInputとTrackの連携
     */
    linkLogicInputToTrack(logicInputId: string, trackId: string): void {
        console.log(`🔗 Linking LogicInput ${logicInputId} to Track ${trackId}`);

        // LogicInputManagerがあればtrackIdを設定
        if (window.logicInputManagerInstance) {
            window.logicInputManagerInstance.setTrackId(logicInputId, trackId);
        }

        // イベント発火
        document.dispatchEvent(new CustomEvent('logic-input-track-linked', {
            detail: { logicInputId, trackId }
        }));
    }

    /**
     * LogicInputとTrackの連携解除
     */
    private _unlinkLogicInput(trackId: string): void {
        if (window.logicInputManagerInstance) {
            const logicInputs = window.logicInputManagerInstance.list();
            const linkedInput = logicInputs.find((input: LogicInput) => input.trackId === trackId);

            if (linkedInput) {
                console.log(`🔓 Unlinking LogicInput ${linkedInput.id} from Track ${trackId}`);
                window.logicInputManagerInstance.setTrackId(linkedInput.id, null);

                document.dispatchEvent(new CustomEvent('logic-input-track-unlinked', {
                    detail: { logicInputId: linkedInput.id, trackId }
                }));
            }
        }
    }

    /**
     * FaustエフェクトからTrackを自動作成
     */
    async createTrackFromEffect(effectRefId: string, config?: Partial<TrackConfig>): Promise<TrackCreationResult> {
        const trackConfig: TrackConfig = {
            name: config?.name || `${effectRefId} Track`,
            kind: 'faust',
            initialVolume: config?.initialVolume || 1,
            dspConfig: {
                effectRefId,
                parameters: config?.dspConfig?.parameters
            },
            logicInputId: config?.logicInputId,
            ...config
        };

        return await this.createTrackSafely(trackConfig);
    }

    /**
     * LogicInputからTrackを自動作成（マイク等）
     */
    async createMicTrackFromLogicInput(logicInput: LogicInput): Promise<TrackCreationResult> {
        if (!this.audioContext) {
            return {
                track: null as any,
                success: false,
                error: 'AudioContext not available'
            };
        }

        try {
            // MicTrack用の設定
            const trackConfig: TrackConfig = {
                name: logicInput.label || `Input ${logicInput.id}`,
                kind: 'mic',
                initialVolume: logicInput.gain || 1,
                logicInputId: logicInput.id
            };

            // 汎用作成機能を使用（入力ノードは後で接続）
            const result = await this.createTrackSafely(trackConfig);

            // 成功した場合はLogicInputとリンク
            if (result.success) {
                this.linkLogicInputToTrack(logicInput.id, result.track.id);
            }

            return result;
        } catch (error) {
            console.error(`❌ Mic track creation failed:`, error);
            return {
                track: null as any,
                success: false,
                error: `Mic track creation failed: ${error}`
            };
        }
    }

    /**
     * 統計情報取得
     */
    getStats(): { totalTracks: number; pendingCreations: number; tracksByKind: Record<TrackKind, number> } {
        const tracks = listTracks();
        const tracksByKind = tracks.reduce((acc, track) => {
            acc[track.kind] = (acc[track.kind] || 0) + 1;
            return acc;
        }, {} as Record<TrackKind, number>);

        return {
            totalTracks: tracks.length,
            pendingCreations: this.pendingCreations.size,
            tracksByKind
        };
    }
}

// シングルトンインスタンス
export const trackLifecycleManager = TrackLifecycleManager.getInstance();

// グローバル公開（デバッグ用）
declare global {
    interface Window {
        trackLifecycleManager: TrackLifecycleManager;
    }
}

window.trackLifecycleManager = trackLifecycleManager;

console.log('🚀 Track Lifecycle Manager loaded');
