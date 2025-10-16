/**
 * Section A Audio System
 * 
 * Section A "Introduction"の音響システム:
 * - トーンキュー(B4 = 493.883Hz)
 * - リバーブエフェクト
 * - 減衰保続処理
 * - グラニュラー合成(将来実装)
 */

import { ensureBaseAudio } from '../core/audioCore';
import { faustWasmLoader } from '../dsp/faustWasmLoader';
import { scanAndRegisterDSPFiles } from '../effects/effectRegistry';
import type { FaustMonoAudioWorkletNode } from '@grame/faustwasm';

export class SectionAAudioSystem {
    private audioCtx: AudioContext | null = null;
    private toneCueNode: FaustMonoAudioWorkletNode | null = null;
    private isInitialized = false;
    private activeTones: Set<number> = new Set(); // 現在再生中のトーンを追跡
    private sectionStartTime: number = 0;
    private phaseTransitionTime: number = 20; // 前半/後半の切り替え時間(秒)

    /**
     * 初期化
     */
    async initialize(): Promise<void> {
        console.log('[SectionA] 🎬 Initializing audio system...');

        try {
            // 1. BaseAudio を確保
            await ensureBaseAudio();
            this.audioCtx = window.audioCtx!;
            const busManager = window.busManager!;
            console.log('[SectionA] ✅ Base Audio ready');

            // 2. エフェクトレジストリをスキャン(reverb.dsp)
            await scanAndRegisterDSPFiles({
                additionalPaths: ['reverb.dsp'],
                quietIfSkipped: true
            });
            console.log('[SectionA] ✅ Effect Registry scanned');

            // 3. リバーブをマスターチェーンに追加
            await busManager.addEffectFromRegistry('reverb');
            console.log('[SectionA] ✅ Reverb added to master chain');

            // 初期リバーブパラメータ設定(控えめ)
            const chainMeta = busManager.getEffectsChainMeta();
            const reverbMeta = chainMeta.find((e: any) => e.refId === 'reverb');

            if (reverbMeta) {
                const reverbItem = busManager['chainItems'].find((item: any) => item.id === reverbMeta.id);
                if (reverbItem && reverbItem.node) {
                    const reverbNode = reverbItem.node as FaustMonoAudioWorkletNode;
                    if (reverbNode.setParamValue) {
                        // 初期値: 前半用の空間的なリバーブ(広めのルーム、高いウェット)
                        reverbNode.setParamValue('/reverb/reverb_roomSize', 0.9);  // 広い空間
                        reverbNode.setParamValue('/reverb/reverb_damping', 0.3);   // 柔らかい減衰
                        reverbNode.setParamValue('/reverb/reverb_wet', 0.8);       // 高いリバーブ成分
                        reverbNode.setParamValue('/reverb/reverb_dry', 0.2);       // 低いドライ成分
                        reverbNode.setParamValue('/reverb/reverb_width', 1.0);     // ステレオ幅最大
                        console.log('[SectionA] 🔧 Initial reverb parameters set (spatial, for early phase)');
                    }
                }
            }

            // 4. トーンキュー用DSPノードをロード
            this.toneCueNode = await faustWasmLoader.loadFaustNode(this.audioCtx, 'tonecue');
            console.log('[SectionA] ✅ Tone cue node loaded');

            // トーンキューノードをSynthBusに接続
            const synthBus = busManager.getSynthInputNode();
            if (synthBus) {
                this.toneCueNode.connect(synthBus);
                console.log('[SectionA] ✅ Tone cue connected to SynthBus');
            }

            this.isInitialized = true;
            console.log('[SectionA] 🎉 Audio system initialization complete!');

        } catch (error) {
            console.error('[SectionA] ❌ Audio system initialization failed:', error);
            throw error;
        }
    }

    /**
     * トーンキューを再生
     * @param params トーンキューパラメータ
     */
    async playToneCue(params?: {
        frequencyHz?: number;
        durationSeconds?: number;
        level?: number;
        phase?: 'early' | 'late'; // 前半(空間的)/後半(持続的)
    }): Promise<void> {
        if (!this.isInitialized || !this.toneCueNode || !this.audioCtx) {
            console.warn('[SectionA] Not initialized, cannot play tone cue');
            return;
        }

        const freq = params?.frequencyHz ?? 493.883; // B4
        const duration = params?.durationSeconds ?? 1.2;
        const level = params?.level ?? 0.22;
        const phase = params?.phase ?? 'early';

        console.log(`[SectionA] 🔊 Playing tone cue: ${freq}Hz, ${duration}s, level ${level}, phase: ${phase}`);

        // AudioContext resumeを確保
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        // パラメータ設定
        if (this.toneCueNode.setParamValue) {
            this.toneCueNode.setParamValue('/tonecue/freq', freq);
            this.toneCueNode.setParamValue('/tonecue/level', level);

            // フェーズに応じたエンベロープ設定
            if (phase === 'early') {
                // 前半: 速いアタック、柔らかいディケイ、短いサステイン(リバーブで空間感)
                this.toneCueNode.setParamValue('/tonecue/attack', 0.02);   // 20ms
                this.toneCueNode.setParamValue('/tonecue/decay', 0.8);     // 800ms
                this.toneCueNode.setParamValue('/tonecue/sustain', 0.3);   // 30% (短め)
                this.toneCueNode.setParamValue('/tonecue/release', 2.0);   // 2s (リバーブで伸びる)
                console.log('[SectionA] 🎛️ Early phase envelope: fast attack, soft decay, short sustain');
            } else {
                // 後半: 速いアタック、柔らかいディケイ、長いサステイン(音高変化で映像同期)
                this.toneCueNode.setParamValue('/tonecue/attack', 0.02);   // 20ms
                this.toneCueNode.setParamValue('/tonecue/decay', 0.8);     // 800ms
                this.toneCueNode.setParamValue('/tonecue/sustain', 0.85);  // 85% (高め)
                this.toneCueNode.setParamValue('/tonecue/release', 1.5);   // 1.5s
                console.log('[SectionA] 🎛️ Late phase envelope: fast attack, soft decay, long sustain');
            }
        }

        // ゲートをON
        if (this.toneCueNode.setParamValue) {
            this.toneCueNode.setParamValue('/tonecue/gate', 1);
        }

        // トーンIDを追跡
        const toneId = Date.now();
        this.activeTones.add(toneId);

        // 指定時間後にゲートをOFF
        setTimeout(() => {
            if (this.toneCueNode && this.toneCueNode.setParamValue) {
                this.toneCueNode.setParamValue('/tonecue/gate', 0);
                console.log('[SectionA] 🔇 Tone cue gate OFF');
                this.activeTones.delete(toneId);
            }
        }, duration * 1000);
    }

    /**
     * トーンの周波数を更新(音高移動によるビジュアル同期)
     */
    updateToneFrequency(frequencyHz: number): void {
        if (!this.isInitialized || !this.toneCueNode) {
            return;
        }

        if (this.toneCueNode.setParamValue) {
            this.toneCueNode.setParamValue('/tonecue/freq', frequencyHz);
            console.log(`[SectionA] 🎵 Frequency updated: ${frequencyHz}Hz`);
        }
    }

    /**
     * セクション開始時刻を記録
     */
    startSection(): void {
        this.sectionStartTime = Date.now() / 1000;
        console.log('[SectionA] ⏱️ Section start time recorded');

        // 20秒後に後半フェーズへ移行(リバーブ調整)
        setTimeout(() => {
            this.transitionToLatePhase();
        }, this.phaseTransitionTime * 1000);
    }

    /**
     * 後半フェーズへ移行(リバーブ調整)
     */
    private transitionToLatePhase(): void {
        console.log('[SectionA] 🔄 Transitioning to late phase...');

        // リバーブをやや控えめに調整(Sustain長く、リバーブは補助的に)
        this.updateReverbParameters({
            roomSize: 0.7,  // やや縮小
            damping: 0.4,   // やや高め
            wet: 0.5,       // 中程度
            dry: 0.5,       // ドライ成分を増やす
            width: 1.0
        });

        console.log('[SectionA] ✅ Transitioned to late phase');
    }

    /**
     * 現在のフェーズを取得
     */
    getCurrentPhase(): 'early' | 'late' {
        const elapsed = (Date.now() / 1000) - this.sectionStartTime;
        return elapsed < this.phaseTransitionTime ? 'early' : 'late';
    }

    /**
     * リバーブパラメータを更新
     */
    updateReverbParameters(params: {
        roomSize?: number;
        damping?: number;
        wet?: number;
        dry?: number;
        width?: number;
    }): void {
        if (!this.isInitialized || !this.audioCtx) {
            console.warn('[SectionA] Not initialized');
            return;
        }

        const busManager = window.busManager;
        if (!busManager) return;

        const chainMeta = busManager.getEffectsChainMeta();
        const reverbMeta = chainMeta.find((e: any) => e.refId === 'reverb');

        if (reverbMeta) {
            const reverbItem = (busManager as any)['chainItems'].find((item: any) => item.id === reverbMeta.id);
            if (reverbItem && reverbItem.node) {
                const reverbNode = reverbItem.node as FaustMonoAudioWorkletNode;
                if (reverbNode.setParamValue) {
                    if (params.roomSize !== undefined) {
                        reverbNode.setParamValue('/reverb/reverb_roomSize', params.roomSize);
                    }
                    if (params.damping !== undefined) {
                        reverbNode.setParamValue('/reverb/reverb_damping', params.damping);
                    }
                    if (params.wet !== undefined) {
                        reverbNode.setParamValue('/reverb/reverb_wet', params.wet);
                    }
                    if (params.dry !== undefined) {
                        reverbNode.setParamValue('/reverb/reverb_dry', params.dry);
                    }
                    if (params.width !== undefined) {
                        reverbNode.setParamValue('/reverb/reverb_width', params.width);
                    }
                    console.log('[SectionA] 🎛️ Reverb parameters updated:', params);
                }
            }
        }
    }

    /**
     * クリーンアップ
     */
    async cleanup(): Promise<void> {
        console.log('[SectionA] 🧹 Cleaning up audio system...');

        if (this.toneCueNode) {
            try {
                this.toneCueNode.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
            this.toneCueNode = null;
        }

        this.isInitialized = false;
        console.log('[SectionA] ✅ Cleanup complete');
    }
}

// グローバルインスタンス
let globalSectionA: SectionAAudioSystem | null = null;

/**
 * グローバルSection Aインスタンスを取得
 */
export function getGlobalSectionA(): SectionAAudioSystem {
    if (!globalSectionA) {
        globalSectionA = new SectionAAudioSystem();
    }
    return globalSectionA;
}
