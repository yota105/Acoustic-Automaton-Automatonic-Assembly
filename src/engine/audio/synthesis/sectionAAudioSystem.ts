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
import { getGlobalMicInputGateManager } from '../devices/micInputGate';
import { initializePerformanceTrackManager } from '../devices/performanceTrackManager';
import { sectionASettings } from '../../../works/acoustic-automaton/sectionAConfig';
import type { FaustMonoAudioWorkletNode } from '@grame/faustwasm';

export class SectionAAudioSystem {
    private audioCtx: AudioContext | null = null;
    private toneCueNode: FaustMonoAudioWorkletNode | null = null;
    private toneCuePanner: StereoPannerNode | null = null;
    private toneCuePanPolarity = 1;
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

            // 3. リバーブをマスターチェーンに追加(既に存在する場合はスキップ)
            const existingChain = busManager.getEffectsChainMeta();
            const hasReverb = existingChain.some((e: any) => e.refId === 'reverb');

            if (!hasReverb) {
                await busManager.addEffectFromRegistry('reverb');
                console.log('[SectionA] ✅ Reverb added to master chain');
            } else {
                console.log('[SectionA] ℹ️ Reverb already exists in chain, skipping');
            }

            // 初期リバーブパラメータ設定(控えめ)
            const chainMeta = busManager.getEffectsChainMeta();
            const reverbMeta = chainMeta.find((e: any) => e.refId === 'reverb');

            if (reverbMeta) {
                const reverbItem = busManager['chainItems'].find((item: any) => item.id === reverbMeta.id);
                if (reverbItem && reverbItem.node) {
                    const reverbNode = reverbItem.node as FaustMonoAudioWorkletNode;
                    if (reverbNode.setParamValue) {
                        // 初期値: 前半用の空間的なリバーブ(広めのルーム、高いウェット)
                        // より明確に聞こえるよう、wetを100%に設定
                        console.log('[SectionA] 🔧 Setting reverb parameters...');
                        const reverbDefaults = sectionASettings.reverb;
                        reverbNode.setParamValue('/reverb/reverb_roomSize', reverbDefaults.roomSize);
                        reverbNode.setParamValue('/reverb/reverb_damping', reverbDefaults.damping);
                        reverbNode.setParamValue('/reverb/reverb_wet', reverbDefaults.wetLevel);
                        reverbNode.setParamValue('/reverb/reverb_dry', reverbDefaults.dryLevel);

                        // 設定後の値を確認
                        const wetValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_wet') : 'N/A';
                        const dryValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_dry') : 'N/A';
                        const roomValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_roomSize') : 'N/A';
                        const dampingValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_damping') : 'N/A';

                        console.log('[SectionA] ✅ Reverb parameters set:');
                        console.log(`  wet: ${wetValue}, dry: ${dryValue}, roomSize: ${roomValue}, damping: ${dampingValue}`);
                        console.log('[SectionA] ℹ️ Using default reverb voicing (subtle ambience)');
                    } else {
                        console.warn('[SectionA] ⚠️ Reverb node does not have setParamValue method');
                    }
                }
            }

            // 4. トーンキュー用DSPノードをロード
            this.toneCueNode = await faustWasmLoader.loadFaustNode(this.audioCtx, 'tonecue');
            console.log('[SectionA] ✅ Tone cue node loaded');

            // トーンキューノードをSynthBusに接続
            const synthBus = busManager.getSynthInputNode();
            if (synthBus) {
                this.toneCuePanner = this.audioCtx.createStereoPanner();
                this.toneCuePanner.pan.value = 0;
                this.toneCuePanPolarity = 1;
                this.toneCueNode.connect(this.toneCuePanner);
                this.toneCuePanner.connect(synthBus);
                console.log('[SectionA] ✅ Tone cue connected to SynthBus via stereo panner');
            }

            // 5. PerformanceTrackManagerを初期化
            initializePerformanceTrackManager(this.audioCtx);
            console.log('[SectionA] ✅ Performance track manager initialized');

            // 6. MicInputGateManagerを初期化
            // マイク入力はリバーブを通すため、effectsBusに接続
            const effectsBus = busManager.getEffectsInputNode();
            const gateManager = getGlobalMicInputGateManager();
            gateManager.initialize(this.audioCtx, effectsBus);
            console.log('[SectionA] ✅ Mic input gate manager initialized with effects bus routing');
            console.log('[SectionA] ℹ️ Mic inputs will route through: Mic → Gate → Track → EffectsBus → Reverb → Master');

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

        // 軽いステレオスプレッドを付加しつつ音色は保持
        if (this.audioCtx && this.toneCuePanner) {
            const widthFactor = sectionASettings.reverb.width ?? 1;
            const baseSpread = phase === 'early' ? 0.35 : 0.25;
            const targetPan = Math.max(-1, Math.min(1, this.toneCuePanPolarity * baseSpread * widthFactor));
            this.toneCuePanner.pan.setTargetAtTime(targetPan, this.audioCtx.currentTime, 0.02);
            console.log(`[SectionA] 🎚️ Stereo spread applied: pan ${targetPan.toFixed(2)}`);
            this.toneCuePanPolarity *= -1;
        }

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
                // 前半: スタッカート主体にしつつ長めのリリースで残響を演出
                this.toneCueNode.setParamValue('/tonecue/attack', 0.01);   // 10ms
                this.toneCueNode.setParamValue('/tonecue/decay', 0.25);    // 250msで素早く減衰
                this.toneCueNode.setParamValue('/tonecue/sustain', 0.05);  // ほぼゼロのサステイン
                this.toneCueNode.setParamValue('/tonecue/release', 1.4);   // リリースで余韻を作る
                console.log('[SectionA] 🎛️ Early phase envelope: staccato body with long release tail');
            } else {
                // 後半: 少し音を残しつつ自然な余韻を作る
                this.toneCueNode.setParamValue('/tonecue/attack', 0.01);   // 10ms
                this.toneCueNode.setParamValue('/tonecue/decay', 0.35);    // 350msで滑らかに
                this.toneCueNode.setParamValue('/tonecue/sustain', 0.2);   // ほんの少し残す
                this.toneCueNode.setParamValue('/tonecue/release', 1.8);   // 長めのリリースで余韻
                console.log('[SectionA] 🎛️ Late phase envelope: sustained presence with gentle tail');
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

        // リバーブ値は初期値を維持して安定した響きを保つ
        this.updateReverbParameters({
            roomSize: sectionASettings.reverb.roomSize,
            damping: sectionASettings.reverb.damping,
            wet: sectionASettings.reverb.wetLevel,
            dry: sectionASettings.reverb.dryLevel
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

        if (this.toneCuePanner) {
            try {
                this.toneCuePanner.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
            this.toneCuePanner = null;
        }

        this.toneCuePanPolarity = 1;

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
