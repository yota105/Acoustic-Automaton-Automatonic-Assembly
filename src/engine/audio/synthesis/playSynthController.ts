/**
 * PlaySynthController
 * Play ボタン用のシンプルなシンセサイザー制御
 * プログラムから直接音を鳴らす
 */

import { FaustMonoDspGenerator, FaustCompiler, LibFaust, instantiateFaustModuleFromFile } from '@grame/faustwasm';
import type { FaustMonoAudioWorkletNode } from '@grame/faustwasm';

export class PlaySynthController {
    private ctx: AudioContext;
    private node: FaustMonoAudioWorkletNode | null = null;
    private isInitialized = false;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
    }

    /**
     * シンセサイザーを初期化
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('[PlaySynth] Already initialized');
            return;
        }

        try {
            console.log('[PlaySynth] Loading Faust module...');
            const faustMod = await instantiateFaustModuleFromFile("/faust/libfaust-wasm.js");
            const libFaust = new LibFaust(faustMod);
            const compiler = new FaustCompiler(libFaust);

            console.log('[PlaySynth] Compiling playtest.dsp...');
            const dspCode = await fetch("/dsp/playtest.dsp").then(r => r.text());
            const gen = new FaustMonoDspGenerator();
            await gen.compile(compiler, "playtest", dspCode, "");

            if ((gen as any).load) {
                await (gen as any).load(this.ctx.audioWorklet);
            }

            console.log('[PlaySynth] Creating AudioWorklet node...');
            this.node = await gen.createNode(this.ctx);

            if (!this.node) {
                throw new Error("Failed to create AudioWorklet node");
            }

            // デフォルトパラメータ設定
            this.setParam('frequency', 440);
            this.setParam('volume', 0.3);
            this.setParam('attack', 0.01);
            this.setParam('decay', 0.1);
            this.setParam('sustain', 0.7);
            this.setParam('release', 0.3);

            this.isInitialized = true;
            console.log('[PlaySynth] ✅ Initialized successfully');
        } catch (error) {
            console.error('[PlaySynth] ❌ Initialization failed:', error);
            throw error;
        }
    }

    /**
     * AudioNode を取得（バスへの接続用）
     */
    getNode(): AudioNode | null {
        return this.node;
    }

    /**
     * パラメータを設定
     */
    setParam(name: string, value: number): void {
        if (!this.node) {
            console.warn('[PlaySynth] Node not initialized');
            return;
        }

        try {
            this.node.setParamValue(`/playtest/${name}`, value);
        } catch (error) {
            console.warn(`[PlaySynth] Failed to set param ${name}:`, error);
        }
    }

    /**
     * 音を鳴らす（gate on）
     */
    noteOn(frequency: number = 440, velocity: number = 0.8): void {
        if (!this.node) {
            console.warn('[PlaySynth] Node not initialized');
            return;
        }

        this.setParam('frequency', frequency);
        this.setParam('volume', velocity * 0.5); // velocity を音量に反映
        this.setParam('gate', 1); // Gate ON
        console.log(`[PlaySynth] 🎵 Note ON: ${frequency}Hz, velocity: ${velocity}`);
    }

    /**
     * 音を止める（gate off）
     */
    noteOff(): void {
        if (!this.node) {
            console.warn('[PlaySynth] Node not initialized');
            return;
        }

        this.setParam('gate', 0); // Gate OFF
        console.log('[PlaySynth] 🎵 Note OFF');
    }

    /**
     * シーケンスを再生（テスト用）
     * @param notes - 周波数の配列
     * @param duration - 各ノートの長さ（秒）
     */
    async playSequence(notes: number[], duration: number = 0.5): Promise<void> {
        for (const freq of notes) {
            this.noteOn(freq, 0.7);
            await new Promise(resolve => setTimeout(resolve, duration * 1000 * 0.8));
            this.noteOff();
            await new Promise(resolve => setTimeout(resolve, duration * 1000 * 0.2));
        }
    }

    /**
     * テストトーンを再生（A4 = 440Hz）
     */
    async playTestTone(duration: number = 1.0): Promise<void> {
        this.noteOn(440, 0.8);
        await new Promise(resolve => setTimeout(resolve, duration * 1000));
        this.noteOff();
    }

    /**
     * クリーンアップ
     */
    cleanup(): void {
        if (this.node) {
            try {
                this.node.disconnect();
            } catch (error) {
                console.warn('[PlaySynth] Disconnect error:', error);
            }
            this.node = null;
        }
        this.isInitialized = false;
        console.log('[PlaySynth] Cleaned up');
    }
}
