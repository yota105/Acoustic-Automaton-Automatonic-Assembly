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
import { initializeMicRecordingManager } from '../devices/micRecordingManager';
import { initializeGranularPlayer } from '../devices/granularPlayer';
import { sectionASettings, getReverbSettingsForTestMode, getTestModeDescription } from '../../../works/acoustic-automaton/sectionsConfig';
import type { FaustMonoAudioWorkletNode } from '@grame/faustwasm';

export class SectionAAudioSystem {
    private audioCtx: AudioContext | null = null;
    private toneCueNode: FaustMonoAudioWorkletNode | null = null;
    private toneCuePanner: StereoPannerNode | null = null;
    private toneCueDryGain: GainNode | null = null;
    private toneCueReverbSend: GainNode | null = null;
    private toneCuePanPolarity = 1;
    private sustainNode: FaustMonoAudioWorkletNode | null = null;
    private sustainPulseGain: GainNode | null = null;
    private sustainBaseGain: GainNode | null = null;
    private sustainDryGain: GainNode | null = null;
    private sustainReverbSend: GainNode | null = null;
    private sustainTexture = 0;
    private sustainActive = false;
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
            const effectsBus = busManager.getEffectsInputNode();
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

            // 初期リバーブパラメータ設定
            const chainMeta = busManager.getEffectsChainMeta();
            const reverbMeta = chainMeta.find((e: any) => e.refId === 'reverb');

            if (reverbMeta) {
                const reverbItem = busManager['chainItems'].find((item: any) => item.id === reverbMeta.id);
                if (reverbItem && reverbItem.node) {
                    const reverbNode = reverbItem.node as FaustMonoAudioWorkletNode;
                    if (reverbNode.setParamValue) {
                        // テストモードに応じたリバーブパラメータを設定
                        const reverbSettings = getReverbSettingsForTestMode();
                        const modeDescription = getTestModeDescription();

                        console.log('[SectionA] 🔧 Setting reverb parameters...');
                        console.log(modeDescription);

                        reverbNode.setParamValue('/reverb/reverb_roomSize', reverbSettings.roomSize);
                        reverbNode.setParamValue('/reverb/reverb_damping', reverbSettings.damping);
                        reverbNode.setParamValue('/reverb/reverb_wet', reverbSettings.wetLevel);
                        reverbNode.setParamValue('/reverb/reverb_dry', reverbSettings.dryLevel);

                        // 設定後の値を確認
                        const wetValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_wet') : 'N/A';
                        const dryValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_dry') : 'N/A';
                        const roomValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_roomSize') : 'N/A';
                        const dampingValue = reverbNode.getParamValue ? reverbNode.getParamValue('/reverb/reverb_damping') : 'N/A';

                        console.log('[SectionA] ✅ Reverb parameters set:');
                        console.log(`  wet: ${wetValue}, dry: ${dryValue}, roomSize: ${roomValue}, damping: ${dampingValue}`);
                    } else {
                        console.warn('[SectionA] ⚠️ Reverb node does not have setParamValue method');
                    }
                }
            }

            // 4. トーンキュー用DSPノードをロード
            this.toneCueNode = await faustWasmLoader.loadFaustNode(this.audioCtx, 'tonecue');
            console.log('[SectionA] ✅ Tone cue node loaded');

            // トーンキューを乾いたシンセバスとリバーブ送信に分岐
            const synthBus = busManager.getSynthInputNode();
            this.toneCuePanner = this.audioCtx.createStereoPanner();
            this.toneCuePanner.pan.value = 0;
            this.toneCuePanPolarity = 1;
            this.toneCueNode.connect(this.toneCuePanner);

            if (synthBus) {
                this.toneCueDryGain = this.audioCtx.createGain();
                this.toneCueDryGain.gain.value = 0.9;
                this.toneCuePanner.connect(this.toneCueDryGain);
                this.toneCueDryGain.connect(synthBus);
                console.log('[SectionA] ✅ Tone cue dry path connected to SynthBus');
            }

            if (effectsBus) {
                this.toneCueReverbSend = this.audioCtx.createGain();
                this.toneCueReverbSend.gain.value = 0.55;
                this.toneCuePanner.connect(this.toneCueReverbSend);
                this.toneCueReverbSend.connect(effectsBus);
                console.log('[SectionA] ✅ Tone cue reverb send connected to effects bus');
            }

            // 4b. サステインベッドDSPノードをロード
            this.sustainNode = await faustWasmLoader.loadFaustNode(this.audioCtx, 'sustain_bed');
            this.sustainPulseGain = this.audioCtx.createGain();
            this.sustainPulseGain.gain.value = 1;

            this.sustainBaseGain = this.audioCtx.createGain();
            this.sustainBaseGain.gain.value = 0;

            this.sustainDryGain = this.audioCtx.createGain();
            this.sustainDryGain.gain.value = 0.45;

            this.sustainReverbSend = this.audioCtx.createGain();
            this.sustainReverbSend.gain.value = 0.75;

            this.sustainNode.connect(this.sustainPulseGain);
            this.sustainPulseGain.connect(this.sustainBaseGain);
            this.sustainBaseGain.connect(this.sustainDryGain);
            this.sustainBaseGain.connect(this.sustainReverbSend);

            if (synthBus) {
                this.sustainDryGain.connect(synthBus);
            }

            if (effectsBus) {
                this.sustainReverbSend.connect(effectsBus);
            }

            console.log('[SectionA] ✅ Sustain bed node loaded and routed');

            if (this.sustainNode.setParamValue) {
                this.sustainNode.setParamValue('/sustain/attack', 0.9);
                this.sustainNode.setParamValue('/sustain/decay', 1.6);
                this.sustainNode.setParamValue('/sustain/sustain', 0.94);
                this.sustainNode.setParamValue('/sustain/release', 5.2);
                this.sustainNode.setParamValue('/sustain/level', 1.0);
                this.sustainNode.setParamValue('/sustain/texture', 0.0);
                this.sustainNode.setParamValue('/sustain/noiseColor', 2600);
            }

            // 5. PerformanceTrackManagerを初期化
            initializePerformanceTrackManager(this.audioCtx);
            console.log('[SectionA] ✅ Performance track manager initialized');

            // 6. MicRecordingManagerを初期化
            initializeMicRecordingManager(this.audioCtx);
            console.log('[SectionA] ✅ Mic recording manager initialized');

            // 7. GranularPlayerを初期化
            initializeGranularPlayer(this.audioCtx);
            console.log('[SectionA] ✅ Granular player initialized');

            // 8. MicInputGateManagerを初期化
            // マイク入力はリバーブを通すため、effectsBusに接続
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
                this.toneCueNode.setParamValue('/tonecue/decay', 0.18);    // 180msで素早く減衰
                this.toneCueNode.setParamValue('/tonecue/sustain', 0.02);  // ほぼゼロのサステイン
                this.toneCueNode.setParamValue('/tonecue/release', 0.45);  // 余韻はリバーブに委ねる
                console.log('[SectionA] 🎛️ Early phase envelope: crisp cutoff handing tail to reverb');
            } else {
                // 後半: 少し音を残しつつ自然な余韻を作る
                this.toneCueNode.setParamValue('/tonecue/attack', 0.01);   // 10ms
                this.toneCueNode.setParamValue('/tonecue/decay', 0.26);    // 260msで滑らかに
                this.toneCueNode.setParamValue('/tonecue/sustain', 0.08);  // 少しだけ胴鳴りを残す
                this.toneCueNode.setParamValue('/tonecue/release', 0.7);   // リリース短縮でリバーブ優先
                console.log('[SectionA] 🎛️ Late phase envelope: brief sustain feeding shared reverb');
            }
        }

        // ゲートをON
        if (this.toneCueNode.setParamValue) {
            this.toneCueNode.setParamValue('/tonecue/gate', 1);
        }

        // サステインベッドを維持・強化
        const sustainTargetLevel = phase === 'early' ? 0.12 : 0.18;
        const sustainRamp = phase === 'early' ? 4.0 : 5.0;
        this.ensureSustainBed(sustainTargetLevel, sustainRamp);
        const pulseStrength = phase === 'early' ? 0.06 : 0.1;
        const pulseDuration = phase === 'early' ? 3.5 : 5.0;
        this.reinforceSustainBed(pulseStrength, pulseDuration);

        // ビジュアルパルスを発行
        this.broadcastSynthPulse({
            frequencyHz: freq,
            durationSeconds: duration,
            level,
            attackSeconds: 0.01,
            releaseSeconds: phase === 'early' ? 1.4 : 1.8
        });

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
     * 現在トーンが再生中かどうかをチェック
     */
    isTonePlaying(): boolean {
        return this.activeTones.size > 0;
    }

    /**
     * エフェクトバス(リバーブ経由)を取得
     * グラニュラーシンセシスなどの外部音源用
     */
    getEffectsBus(): AudioNode {
        if (!this.audioCtx) {
            throw new Error('[SectionA] AudioContext not initialized');
        }

        const busManager = window.busManager;
        if (!busManager) {
            throw new Error('[SectionA] BusManager not found');
        }

        return busManager.getEffectsInputNode();
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

        // テストモードに応じたリバーブ設定を維持
        const reverbSettings = getReverbSettingsForTestMode();
        this.updateReverbParameters({
            roomSize: reverbSettings.roomSize,
            damping: reverbSettings.damping,
            wet: reverbSettings.wetLevel,
            dry: reverbSettings.dryLevel
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

    ensureSustainBed(targetLevel: number, rampSeconds: number = 4.0): void {
        if (!this.isInitialized || !this.audioCtx || !this.sustainNode || !this.sustainBaseGain) {
            return;
        }

        const now = this.audioCtx.currentTime;
        const ramp = Math.max(0.25, rampSeconds);

        if (!this.sustainActive && this.sustainNode.setParamValue) {
            this.sustainNode.setParamValue('/sustain/gate', 1);
            this.sustainNode.setParamValue('/sustain/freq', 493.883);
            this.sustainActive = true;
        }

        const clampedTarget = this.clamp(targetLevel, 0, 0.4);

        this.sustainBaseGain.gain.cancelScheduledValues(now);
        this.sustainBaseGain.gain.setValueAtTime(this.sustainBaseGain.gain.value, now);
        this.sustainBaseGain.gain.linearRampToValueAtTime(clampedTarget, now + ramp);
    }

    reinforceSustainBed(strength: number = 0.08, durationSeconds: number = 4.0): void {
        if (!this.isInitialized || !this.audioCtx || !this.sustainPulseGain) {
            return;
        }

        const now = this.audioCtx.currentTime;
        const accentStrength = this.clamp(strength, 0, 0.8);
        const peak = 1 + accentStrength * 2.4; // drive accent harder so it reads clearly in the hall mix
        const duration = Math.max(1.0, durationSeconds);

        this.sustainPulseGain.gain.cancelScheduledValues(now);
        const currentPulse = Math.max(0.0001, this.sustainPulseGain.gain.value);
        this.sustainPulseGain.gain.setValueAtTime(currentPulse, now);
        this.sustainPulseGain.gain.exponentialRampToValueAtTime(peak, now + 0.28);
        this.sustainPulseGain.gain.exponentialRampToValueAtTime(1.0, now + duration + 0.35);

        if (this.sustainNode?.setParamValue) {
            const textureDelta = this.clamp(accentStrength * 0.15, 0.01, 0.18);
            this.advanceSustainTexture(textureDelta);
        }
    }

    advanceSustainTexture(delta: number = 0.12): void {
        if (!this.sustainNode?.setParamValue) {
            return;
        }

        this.sustainTexture = this.clamp(this.sustainTexture + delta, 0, 1);
        this.sustainNode.setParamValue('/sustain/texture', this.sustainTexture);

        const baseColor = 2600;
        const targetColor = 9000;
        const color = baseColor + (targetColor - baseColor) * this.sustainTexture;
        this.sustainNode.setParamValue('/sustain/noiseColor', color);
    }

    stopSustainBed(fadeSeconds: number = 6.0): void {
        if (!this.isInitialized || !this.audioCtx || !this.sustainNode || !this.sustainBaseGain) {
            return;
        }

        if (!this.sustainActive) {
            return;
        }

        const now = this.audioCtx.currentTime;
        const fade = Math.max(0.5, fadeSeconds);

        this.sustainBaseGain.gain.cancelScheduledValues(now);
        this.sustainBaseGain.gain.setValueAtTime(this.sustainBaseGain.gain.value, now);
        this.sustainBaseGain.gain.linearRampToValueAtTime(0, now + fade);

        if (this.sustainNode.setParamValue) {
            this.sustainNode.setParamValue('/sustain/gate', 0);
        }

        this.sustainActive = false;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
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

        if (this.toneCueDryGain) {
            try { this.toneCueDryGain.disconnect(); } catch (e) { /* ignore */ }
            this.toneCueDryGain = null;
        }

        if (this.toneCueReverbSend) {
            try { this.toneCueReverbSend.disconnect(); } catch (e) { /* ignore */ }
            this.toneCueReverbSend = null;
        }

        if (this.sustainNode) {
            try { this.sustainNode.disconnect(); } catch (e) { /* ignore */ }
            this.sustainNode = null;
        }

        if (this.sustainPulseGain) {
            try { this.sustainPulseGain.disconnect(); } catch (e) { /* ignore */ }
            this.sustainPulseGain = null;
        }

        if (this.sustainBaseGain) {
            try { this.sustainBaseGain.disconnect(); } catch (e) { /* ignore */ }
            this.sustainBaseGain = null;
        }

        if (this.sustainDryGain) {
            try { this.sustainDryGain.disconnect(); } catch (e) { /* ignore */ }
            this.sustainDryGain = null;
        }

        if (this.sustainReverbSend) {
            try { this.sustainReverbSend.disconnect(); } catch (e) { /* ignore */ }
            this.sustainReverbSend = null;
        }

        this.sustainActive = false;
        this.sustainTexture = 0;

        this.toneCuePanPolarity = 1;

        this.isInitialized = false;
        console.log('[SectionA] ✅ Cleanup complete');
    }

    /**
     * ビジュアルパルスを配信
     */
    private broadcastSynthPulse(params: {
        frequencyHz: number;
        durationSeconds: number;
        level: number;
        attackSeconds: number;
        releaseSeconds: number;
    }): void {
        try {
            const visualIntensity = Math.min(2.0, Math.max(0.45, params.level * 4.0));
            const envelopeSpan = params.releaseSeconds + params.attackSeconds * 0.5;
            const visualDuration = Math.max(0.35, Math.min(1.1, envelopeSpan));

            const channel = new BroadcastChannel('performance-control');
            channel.postMessage({
                type: 'visual-event',
                eventId: `synth-pulse-${Date.now()}`,
                action: 'synth_pulse',
                parameters: {
                    intensity: visualIntensity,
                    durationSeconds: visualDuration,
                    frequencyHz: params.frequencyHz,
                    level: params.level,
                    attackSeconds: params.attackSeconds,
                    releaseSeconds: params.releaseSeconds
                },
                target: 'synth',
                audioContextTime: this.audioCtx?.currentTime ?? 0,
                musicalTime: { bar: 1, beat: 1, tempo: 60 },
                sectionId: 'section_a_intro',
                timestamp: Date.now()
            });
            channel.close();
            console.log('[SectionA] 📡 Synth pulse broadcasted to visuals');
        } catch (error) {
            console.error('[SectionA] ❌ Failed to broadcast synth pulse:', error);
        }
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
