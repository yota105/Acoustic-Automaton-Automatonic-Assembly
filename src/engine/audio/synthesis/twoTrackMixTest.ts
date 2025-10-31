/**
 * Two-Track Mix with Reverb Test
 * Track 1: PlaySynth (playtest.dsp)
 * Track 2: TestSignal (testsignals.dsp)
 * Master: Reverb effect
 */

import { PlaySynthController } from './playSynthController';
import { ensureBaseAudio, resumeAudio } from '../core/audioCore';
import { scanAndRegisterDSPFiles } from '../effects/effectRegistry';
import { faustWasmLoader } from '../dsp/faustWasmLoader';
import type { FaustMonoAudioWorkletNode } from '@grame/faustwasm';

export class TwoTrackMixTest {
    private audioCtx: AudioContext | null = null;
    private track1Synth: PlaySynthController | null = null;
    private track2Node: FaustMonoAudioWorkletNode | null = null;
    private isInitialized = false;

    /**
     * 初期化
     */
    async initialize(): Promise<void> {
        console.log('[TwoTrackMixTest] 🎬 Initializing...');

        try {
            // 1. BaseAudio を確保
            await ensureBaseAudio();
            this.audioCtx = window.audioCtx!;
            const busManager = window.busManager!;
            console.log('[TwoTrackMixTest] ✅ Base Audio ready');

            // 2. エフェクトレジストリをスキャン
            await scanAndRegisterDSPFiles({
                additionalPaths: ['reverb.dsp'],
                quietIfSkipped: true
            });
            console.log('[TwoTrackMixTest] ✅ Effect Registry scanned');

            // 3. Track 1: PlaySynth (playtest.dsp)
            this.track1Synth = new PlaySynthController(this.audioCtx);
            await this.track1Synth.initialize();
            console.log('[TwoTrackMixTest] ✅ Track 1 (PlaySynth) ready');

            // 4. Track 2: TestSignal (testsignals.dsp)
            this.track2Node = await faustWasmLoader.loadFaustNode(this.audioCtx, 'testsignals');
            console.log('[TwoTrackMixTest] ✅ Track 2 (TestSignals) ready');

            // 5. トラックをバスに接続
            const synthBus = busManager.getSynthInputNode();

            if (this.track1Synth.getNode()) {
                this.track1Synth.getNode()!.connect(synthBus);
                console.log('[TwoTrackMixTest] ✅ Track 1 connected to synthBus');
            }

            if (this.track2Node) {
                this.track2Node.connect(synthBus);
                console.log('[TwoTrackMixTest] ✅ Track 2 connected to synthBus');
            }

            // 6. マスターにリバーブを追加
            await busManager.addEffectFromRegistry('reverb');
            console.log('[TwoTrackMixTest] ✅ Reverb added to master chain');

            // 7. リバーブのパラメータを設定
            const chainMeta = busManager.getEffectsChainMeta();
            console.log('[TwoTrackMixTest] 📊 Effect chain:', chainMeta);

            const reverbItem = chainMeta.find(item => item.refId === 'reverb');

            if (reverbItem) {
                const effectsChain = (busManager as any).chainItems;
                const instance = effectsChain.find((item: any) => item.id === reverbItem.id);

                console.log('[TwoTrackMixTest] 🎛️ Reverb instance found:', instance);

                if (instance?.instance?.node) {
                    const node = instance.instance.node as any;

                    // Faustノードの直接パラメータ設定（初期値は低め）
                    if (node.setParamValue) {
                        console.log('[TwoTrackMixTest] 🔧 Setting initial reverb params (low)');
                        node.setParamValue('/reverb/reverb_roomSize', 0.3);
                        node.setParamValue('/reverb/reverb_wet', 0.2);
                        node.setParamValue('/reverb/reverb_dry', 0.8);
                        node.setParamValue('/reverb/reverb_damping', 0.5);
                        console.log('[TwoTrackMixTest] ✅ Initial reverb parameters set (will increase during play)');
                    }
                } else {
                    console.warn('[TwoTrackMixTest] ⚠️ Reverb node not found!');
                }
            } else {
                console.warn('[TwoTrackMixTest] ⚠️ Reverb not in effect chain!');
            }

            this.isInitialized = true;
            console.log('[TwoTrackMixTest] 🎉 Initialization complete!');
            console.log('[TwoTrackMixTest] Signal flow: Track1 + Track2 → SynthBus → Reverb → Output');
        } catch (error) {
            console.error('[TwoTrackMixTest] ❌ Initialization failed:', error);
            throw error;
        }
    }

    /**
     * テスト再生開始
     */
    async play(): Promise<void> {
        if (!this.isInitialized) {
            console.error('[TwoTrackMixTest] Not initialized!');
            return;
        }

        try {
            await resumeAudio();
            console.log('[TwoTrackMixTest] ▶️ Starting playback...');

            // リバーブを段階的に強くする
            this.startReverbFade();

            // Track 1: メロディーシーケンス (C4 → E4 → G4 → C5)
            if (this.track1Synth) {
                const melody = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
                this.track1Synth.playSequence(melody, 0.5);
                console.log('[TwoTrackMixTest] ✅ Track 1 playing melody');
            }

            // Track 2: テスト信号を鳴らす (440Hz tone)
            if (this.track2Node) {
                const paramInfo = faustWasmLoader.getParameterInfo('testsignals');
                console.log('[TwoTrackMixTest] Track 2 params:', paramInfo);

                // FaustNodeの直接パラメータ操作
                const node = this.track2Node as any;
                if (node.setParamValue) {
                    node.setParamValue('/test/select', 0); // 0 = tone
                    node.setParamValue('/test/freq', 440);
                    node.setParamValue('/test/level', 0.2);
                    console.log('[TwoTrackMixTest] ✅ Track 2 playing 440Hz tone');
                }
            }

            console.log('[TwoTrackMixTest] 🎵 Both tracks playing with reverb gradually increasing!');
        } catch (error) {
            console.error('[TwoTrackMixTest] ❌ Play failed:', error);
            throw error;
        }
    }

    /**
     * リバーブを段階的に強くする (5秒かけて)
     */
    private startReverbFade(): void {
        const busManager = window.busManager!;
        const chainMeta = busManager.getEffectsChainMeta();
        const reverbItem = chainMeta.find(item => item.refId === 'reverb');

        if (!reverbItem) {
            console.warn('[TwoTrackMixTest] ⚠️ Reverb not found for fade');
            return;
        }

        const effectsChain = (busManager as any).chainItems;
        const instance = effectsChain.find((item: any) => item.id === reverbItem.id);

        if (!instance?.instance?.node) {
            console.warn('[TwoTrackMixTest] ⚠️ Reverb node not found for fade');
            return;
        }

        const node = instance.instance.node as any;
        if (!node.setParamValue) return;

        // 初期値
        let roomSize = 0.3;
        let wet = 0.2;
        let dry = 0.8;

        // 目標値
        const targetRoomSize = 0.95;
        const targetWet = 0.8;
        const targetDry = 0.2;

        // 2秒かけて段階的に変化
        const duration = 2000; // 2秒
        const steps = 40; // 40ステップ
        const interval = duration / steps; // 50ms間隔

        let currentStep = 0;

        const fadeInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            // 線形補間
            roomSize = 0.3 + (targetRoomSize - 0.3) * progress;
            wet = 0.2 + (targetWet - 0.2) * progress;
            dry = 0.8 + (targetDry - 0.8) * progress;

            node.setParamValue('/reverb/reverb_roomSize', roomSize);
            node.setParamValue('/reverb/reverb_wet', wet);
            node.setParamValue('/reverb/reverb_dry', dry);

            if (currentStep % 8 === 0) {
                console.log(`[TwoTrackMixTest] 🎚️ Reverb: roomSize=${roomSize.toFixed(2)}, wet=${wet.toFixed(2)}`);
            }

            if (currentStep >= steps) {
                clearInterval(fadeInterval);
                console.log('[TwoTrackMixTest] ✅ Reverb fade complete in 2 seconds (roomSize: 0.95, wet: 0.8)');
            }
        }, interval);
    }

    /**
     * 停止
     */
    stop(): void {
        console.log('[TwoTrackMixTest] ⏹️ Stopping...');

        // Track 1 を停止
        if (this.track1Synth) {
            this.track1Synth.noteOff();
        }

        // Track 2 を停止 (信号レベルを0に)
        if (this.track2Node) {
            const node = this.track2Node as any;
            if (node.setParamValue) {
                node.setParamValue('/test/level', 0);
            }
        }

        console.log('[TwoTrackMixTest] ✅ Stopped');
    }

    /**
     * Track 2 の信号種類を変更
     */
    changeTrack2Signal(signalType: 0 | 1 | 2): void {
        // 0: tone, 1: noise, 2: impulse
        if (this.track2Node) {
            const node = this.track2Node as any;
            if (node.setParamValue) {
                node.setParamValue('/test/select', signalType);
                console.log(`[TwoTrackMixTest] Track 2 signal changed to ${['tone', 'noise', 'impulse'][signalType]}`);
            }
        }
    }

    /**
     * リバーブパラメータを調整
     */
    adjustReverb(params: { roomSize?: number; wet?: number; dry?: number }): void {
        const busManager = window.busManager!;
        const chainMeta = busManager.getEffectsChainMeta();
        const reverbItem = chainMeta.find(item => item.refId === 'reverb');

        if (reverbItem) {
            const effectsChain = (busManager as any).chainItems;
            const instance = effectsChain.find((item: any) => item.id === reverbItem.id);

            if (instance?.instance?.node) {
                const node = instance.instance.node as any;
                if (node.setParamValue) {
                    if (params.roomSize !== undefined) {
                        node.setParamValue('/reverb/reverb_roomSize', params.roomSize);
                    }
                    if (params.wet !== undefined) {
                        node.setParamValue('/reverb/reverb_wet', params.wet);
                    }
                    if (params.dry !== undefined) {
                        node.setParamValue('/reverb/reverb_dry', params.dry);
                    }
                    console.log('[TwoTrackMixTest] Reverb parameters adjusted:', params);
                }
            }
        }
    }

    /**
     * 状態を取得
     */
    getStatus(): any {
        return {
            initialized: this.isInitialized,
            track1Ready: this.track1Synth !== null,
            track2Ready: this.track2Node !== null,
            audioContext: this.audioCtx?.state
        };
    }
}

// グローバルAPIとして公開
declare global {
    interface Window {
        twoTrackTest?: TwoTrackMixTest;
    }
}

if (typeof window !== 'undefined') {
    const test = new TwoTrackMixTest();
    (window as any).twoTrackTest = test;
    console.log('🧪 Two-Track Mix Test available: window.twoTrackTest');
    console.log('   Usage:');
    console.log('     await twoTrackTest.initialize()  - Initialize test');
    console.log('     await twoTrackTest.play()        - Start playback');
    console.log('     twoTrackTest.stop()              - Stop playback');
    console.log('     twoTrackTest.changeTrack2Signal(1) - Change to noise (0:tone, 1:noise, 2:impulse)');
    console.log('     twoTrackTest.adjustReverb({ wet: 0.6 }) - Adjust reverb');
}

export default TwoTrackMixTest;
