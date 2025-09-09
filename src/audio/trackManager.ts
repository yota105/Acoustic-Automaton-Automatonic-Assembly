/**
 * TrackManager - Trackレイヤーの統合管理インターフェース
 *
 * Phase 5: Live Electronics Performance System のためのTrack管理
 * 既存のtracks.tsの機能を統合し、LiveMixerとの連携を提供
 */

import { Track, TrackKind, setTrackVolume, toggleMute, toggleSolo, DSPUnit } from './tracks';
import { EffectInstance } from './effects/effectRegistry';

export interface TrackCreationOptions {
    id?: string;
    name?: string;
    kind: TrackKind;
    userVolume?: number;
    inputNode?: AudioNode;
    outputNode?: AudioNode;
    dspChain?: DSPUnit[];
    insertEffects?: EffectInstance[];
    metadata?: Record<string, any>;
}

export class TrackManager {
    private tracks: Map<string, Track> = new Map();
    private audioContext: AudioContext;
    // private logicInputManager: LogicInputManager; // TODO: 使用時に有効化

    constructor(audioContext: AudioContext /* logicInputManager: LogicInputManager */) {
        this.audioContext = audioContext;
        // this.logicInputManager = logicInputManager;
        console.log('🎵 TrackManager initialized');
    }

    /**
     * 新しいTrackを作成
     */
    async createTrack(options: TrackCreationOptions): Promise<Track> {
        const trackId = options.id || `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Use the shared AudioContext from constructor
        const audioContext = this.audioContext;

        let track: Track;

        switch (options.kind) {
            case 'custom':
                // Custom track creation - user provides audio source
                const customInput = options.inputNode || audioContext.createGain();
                const customVolume = audioContext.createGain();
                const customOutput = options.outputNode || audioContext.createGain();

                customInput.connect(customVolume);
                customVolume.connect(customOutput);

                track = {
                    id: trackId,
                    name: options.name || 'Custom Track',
                    kind: 'custom',
                    inputNode: customInput,
                    volumeGain: customVolume,
                    outputNode: customOutput,
                    dspChain: options.dspChain || [],
                    muted: false,
                    solo: false,
                    userVolume: options.userVolume || 0.8,
                    insertEffects: options.insertEffects || []
                };
                break;

            case 'mic':
                // Microphone track creation
                const micInput = options.inputNode || audioContext.createGain();
                const micVolume = audioContext.createGain();
                const micOutput = options.outputNode || audioContext.createGain();

                micInput.connect(micVolume);
                micVolume.connect(micOutput);

                track = {
                    id: trackId,
                    name: options.name || 'Microphone',
                    kind: 'mic',
                    inputNode: micInput,
                    volumeGain: micVolume,
                    outputNode: micOutput,
                    dspChain: options.dspChain || [],
                    muted: false,
                    solo: false,
                    userVolume: options.userVolume || 0.8,
                    insertEffects: options.insertEffects || []
                };
                break;

            case 'faust':
                // Faust DSP track creation
                const faustInput = options.inputNode || audioContext.createGain();
                const faustVolume = audioContext.createGain();
                const faustOutput = options.outputNode || audioContext.createGain();

                faustInput.connect(faustVolume);
                faustVolume.connect(faustOutput);

                track = {
                    id: trackId,
                    name: options.name || 'Faust Synth',
                    kind: 'faust',
                    inputNode: faustInput,
                    volumeGain: faustVolume,
                    outputNode: faustOutput,
                    dspChain: options.dspChain || [],
                    muted: false,
                    solo: false,
                    userVolume: options.userVolume || 0.8,
                    insertEffects: options.insertEffects || []
                };
                break;

            default:
                throw new Error(`Unsupported track kind: ${options.kind}`);
        }

        // Store the track
        this.tracks.set(trackId, track);

        // Update statistics
        this.updateStats();

        return track;
    }

    /**
     * Trackを取得
     */
    async getTrack(trackId: string): Promise<Track | null> {
        // メモリ上のキャッシュを確認
        if (this.tracks.has(trackId)) {
            return this.tracks.get(trackId)!;
        }

        // TODO: 永続化されたTrackの復元
        // 現在はメモリ上のみ管理
        return null;
    }

    /**
     * 全Trackを取得
     */
    getAllTracks(): Track[] {
        return Array.from(this.tracks.values());
    }

    /**
     * Trackの音量を設定
     */
    setTrackVolume(trackId: string, volume: number): void {
        setTrackVolume(trackId, volume);
    }

    /**
     * Trackのミュート切り替え
     */
    toggleTrackMute(trackId: string): void {
        toggleMute(trackId);
    }

    /**
     * Trackのソロ切り替え
     */
    toggleTrackSolo(trackId: string): void {
        toggleSolo(trackId);
    }

    /**
     * Trackのルーティングを更新
     */
    async updateTrackRouting(trackId: string, routing: { synth?: boolean; effects?: boolean; monitor?: boolean }): Promise<void> {
        const track = await this.getTrack(trackId);
        if (!track) {
            throw new Error(`Track not found: ${trackId}`);
        }

        // TODO: BusManager経由でルーティング更新
        // 現在はTrackの接続状態のみ管理
        console.log(`🔀 Updated routing for track ${track.name}:`, routing);
    }

    /**
     * Trackを削除
     */
    async removeTrack(trackId: string): Promise<void> {
        const track = this.tracks.get(trackId);
        if (!track) return;

        // Trackのクリーンアップ
        try {
            track.outputNode.disconnect();
            track.volumeGain.disconnect();
        } catch (error) {
            console.warn('Error disconnecting track:', error);
        }

        this.tracks.delete(trackId);
        console.log(`🗑️ Track removed: ${track.name}`);
    }

    /**
     * 特定の種類のTrackを取得
     */
    getTracksByKind(kind: TrackKind): Track[] {
        return Array.from(this.tracks.values()).filter(track => track.kind === kind);
    }

    /**
     * アクティブなTrackを取得（ミュートされていない）
     */
    getActiveTracks(): Track[] {
        return Array.from(this.tracks.values()).filter(track => !track.muted);
    }

    /**
     * Trackの統計情報を取得
     */
    getTrackStats(): {
        total: number;
        byKind: Record<TrackKind, number>;
        active: number;
    } {
        const tracks = Array.from(this.tracks.values());
        const byKind: Record<TrackKind, number> = {
            mic: 0,
            faust: 0,
            sample: 0,
            bus: 0,
            controller: 0,
            midi: 0,
            custom: 0
        };

        tracks.forEach(track => {
            byKind[track.kind]++;
        });

        return {
            total: tracks.length,
            byKind,
            active: tracks.filter(track => !track.muted).length
        };
    }

    /**
     * 統計情報を更新
     */
    private updateStats(): void {
        // 統計情報の更新ロジック（必要に応じて実装）
        // 現在は単にログ出力のみ
        console.log(`📊 TrackManager stats updated: ${this.tracks.size} tracks`);
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        for (const track of this.tracks.values()) {
            try {
                track.outputNode.disconnect();
                track.volumeGain.disconnect();
            } catch (error) {
                console.warn('Error disconnecting track during disposal:', error);
            }
        }

        this.tracks.clear();
        console.log('🗑️ TrackManager disposed');
    }
}
