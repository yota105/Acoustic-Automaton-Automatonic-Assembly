/**
 * Faustメトロノームコントローラー
 * MusicalTimeManagerと連携してテンポと拍の可視化・可聴化
 */

import { FaustMonoAudioWorkletNode } from "@grame/faustwasm";

export interface MetronomeState {
    isActive: boolean;
    volume: number;
    currentBeat: number;
    currentBar: number;
    tempo: {
        bpm: number;
        numerator: number;
        denominator: number;
    };
}

export class FaustMetronome {
    private audioContext: AudioContext;
    private faustNode: FaustMonoAudioWorkletNode | null = null;
    private useFaustDSP: boolean = false;
    private scheduledFaustTriggers: number[] = [];
    private state: MetronomeState = {
        isActive: false,
        volume: 0.3,
        currentBeat: 1,
        currentBar: 1,
        tempo: { bpm: 120, numerator: 4, denominator: 4 }
    };

    // 拍の重要度定義
    private readonly BEAT_TYPES = {
        DOWNBEAT: 1,      // 小節頭（最重要）
        STRONG_BEAT: 2,   // 強拍
        WEAK_BEAT: 3,     // 弱拍
        SUBDIVISION: 4    // 細分化
    };

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
        this.initializeMetronome();
    }

    /**
     * メトロノーム初期化
     */
    private async initializeMetronome(): Promise<void> {
        try {
            console.log('🥁 Initializing Faust DSP Metronome...');
            await this.loadFaustDSP();
            console.log('✅ Faust DSP Metronome ready');
        } catch (error) {
            console.warn('⚠️ Failed to load Faust DSP, falling back to WebAudio:', error);
            this.useFaustDSP = false;
            this.createWebAudioMetronome();
            console.log('✅ WebAudio Metronome ready (fallback)');
        }
    }

    /**
     * Faust DSPメトロノームを読み込み
     */
    private async loadFaustDSP(): Promise<void> {
        try {
            // Faust DSPファイルをコンパイル・ロード
            const { instantiateFaustModuleFromFile, LibFaust, FaustCompiler, FaustMonoDspGenerator } = await import("@grame/faustwasm");

            const faustModule = await instantiateFaustModuleFromFile("/faust/libfaust-wasm.js");
            const libFaust = new LibFaust(faustModule);
            const compiler = new FaustCompiler(libFaust);
            const generator = new FaustMonoDspGenerator();

            // DSPファイルを読み込み
            const dspCode = await fetch('/dsp/metronome.dsp').then(r => r.text());

            // コンパイル
            await generator.compile(compiler, "metronome", dspCode, "-I /dsp/");

            // AudioWorkletNodeを作成
            this.faustNode = await generator.createNode(
                this.audioContext,
                undefined,
                undefined,
                undefined,
                undefined
            ) as FaustMonoAudioWorkletNode;

            // 出力に接続
            this.faustNode.connect(this.audioContext.destination);

            // 初期パラメータ設定
            this.faustNode.setParamValue("/metronome/volume", this.state.volume);
            this.faustNode.setParamValue("/metronome/beat_type", 1);
            this.faustNode.setParamValue("/metronome/trigger", 0);

            this.useFaustDSP = true;
            console.log('🎛️ Faust DSP metronome loaded successfully');
            console.log('📊 Available parameters:', this.faustNode.getParams());
        } catch (error) {
            console.error('Failed to load Faust DSP:', error);
            throw error;
        }
    }

    /**
     * WebAudio APIによる代替メトロノーム実装
     */
    private createWebAudioMetronome(): void {
        // WebAudioで簡易メトロノーム音源を作成
        console.log('🔊 Creating WebAudio metronome fallback');
    }

    /**
     * 拍の重要度を判定
     */
    private getBeatType(_bar: number, beat: number, subdivision: number = 0): number {
        // 小節頭（1拍目）
        if (beat === 1) {
            return this.BEAT_TYPES.DOWNBEAT;
        }

        // 細分化がある場合
        if (subdivision > 0) {
            return this.BEAT_TYPES.SUBDIVISION;
        }

        // 拍子に応じた強拍・弱拍の判定
        const { numerator } = this.state.tempo;

        if (numerator === 4) {
            // 4拍子: 1(強) 2(弱) 3(中強) 4(弱)
            return beat === 3 ? this.BEAT_TYPES.STRONG_BEAT : this.BEAT_TYPES.WEAK_BEAT;
        } else if (numerator === 3) {
            // 3拍子: 1(強) 2(弱) 3(弱)
            return this.BEAT_TYPES.WEAK_BEAT;
        } else if (numerator === 2) {
            // 2拍子: 1(強) 2(弱)
            return this.BEAT_TYPES.WEAK_BEAT;
        } else {
            // その他の複雑拍子
            const strongBeats = Math.floor(numerator / 2);
            return beat <= strongBeats ? this.BEAT_TYPES.STRONG_BEAT : this.BEAT_TYPES.WEAK_BEAT;
        }
    }

    /**
     * 拍をトリガー
     */
    public triggerBeat(bar: number, beat: number, subdivision: number = 0): void {
        if (!this.state.isActive) return;

        this.state.currentBar = bar;
        this.state.currentBeat = beat;

        const beatType = this.getBeatType(bar, beat, subdivision);
        this.playBeat(beatType, bar, beat, subdivision);
    }

    /**
     * 拍音を再生
     */
    private playBeat(beatType: number, bar: number, beat: number, subdivision: number): void {
        // Faust DSPを使用する場合
        if (this.useFaustDSP && this.faustNode) {
            this.playBeatWithFaust(beatType, bar, beat, subdivision);
            return;
        }

        // WebAudioフォールバック
        const now = this.audioContext.currentTime;

        // 音色設定
        const frequencies = {
            [this.BEAT_TYPES.DOWNBEAT]: 880,    // 高音 - 小節頭
            [this.BEAT_TYPES.STRONG_BEAT]: 660, // 中高音 - 強拍
            [this.BEAT_TYPES.WEAK_BEAT]: 440,   // 中音 - 弱拍
            [this.BEAT_TYPES.SUBDIVISION]: 330  // 低音 - 細分化
        };

        const durations = {
            [this.BEAT_TYPES.DOWNBEAT]: 0.3,    // 長い - 重要
            [this.BEAT_TYPES.STRONG_BEAT]: 0.2,
            [this.BEAT_TYPES.WEAK_BEAT]: 0.15,
            [this.BEAT_TYPES.SUBDIVISION]: 0.05 // 短い - 細分化
        };

        const volumes = {
            [this.BEAT_TYPES.DOWNBEAT]: this.state.volume * 1.0,     // 最大音量
            [this.BEAT_TYPES.STRONG_BEAT]: this.state.volume * 0.7,
            [this.BEAT_TYPES.WEAK_BEAT]: this.state.volume * 0.5,
            [this.BEAT_TYPES.SUBDIVISION]: this.state.volume * 0.3   // 小音量
        };

        const freq = frequencies[beatType];
        const duration = durations[beatType];
        const volume = volumes[beatType];

        // 音源作成
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, now);

        // フィルタ設定
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(freq * 2, now);

        // エンベロープ
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // 接続
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // 再生
        oscillator.start(now);
        oscillator.stop(now + duration);

        // ログ出力
        const beatTypeNames = {
            [this.BEAT_TYPES.DOWNBEAT]: '🔴 DOWNBEAT',
            [this.BEAT_TYPES.STRONG_BEAT]: '🟡 STRONG',
            [this.BEAT_TYPES.WEAK_BEAT]: '🟢 weak',
            [this.BEAT_TYPES.SUBDIVISION]: '🔵 sub'
        };

        const subdivisionText = subdivision > 0 ? `+${subdivision}` : '';
        console.log(`🥁 ${beatTypeNames[beatType]} Bar:${bar} Beat:${beat}${subdivisionText} (${freq}Hz, ${(volume * 100).toFixed(0)}%)`);
    }

    /**
     * Faust DSPで拍音を再生
     */
    private playBeatWithFaust(beatType: number, bar: number, beat: number, subdivision: number): void {
        if (!this.faustNode) return;

        // Faust DSPのパラメータを設定
        this.faustNode.setParamValue("/metronome/beat_type", beatType);
        this.faustNode.setParamValue("/metronome/volume", this.state.volume);

        // トリガーを発火（ボタンを押す→離す）
        this.faustNode.setParamValue("/metronome/trigger", 1);

        // 10ms後にトリガーをリセット
        setTimeout(() => {
            if (this.faustNode) {
                this.faustNode.setParamValue("/metronome/trigger", 0);
            }
        }, 10);

        // ログ出力
        const beatTypeNames = {
            [this.BEAT_TYPES.DOWNBEAT]: '🔴 DOWNBEAT',
            [this.BEAT_TYPES.STRONG_BEAT]: '🟡 STRONG',
            [this.BEAT_TYPES.WEAK_BEAT]: '🟢 weak',
            [this.BEAT_TYPES.SUBDIVISION]: '🔵 sub'
        };

        const subdivisionText = subdivision > 0 ? `+${subdivision}` : '';
        console.log(`🎛️ [Faust DSP] ${beatTypeNames[beatType]} Bar:${bar} Beat:${beat}${subdivisionText}`);
    }

    /**
     * メトロノーム開始
     */
    public start(): void {
        this.state.isActive = true;
        console.log('▶️ Metronome started');
    }

    /**
     * メトロノーム停止
     */
    public stop(): void {
        this.state.isActive = false;
        if (this.scheduledFaustTriggers.length) {
            this.scheduledFaustTriggers.forEach(timeoutId => clearTimeout(timeoutId));
            this.scheduledFaustTriggers = [];
        }
        console.log('⏹️ Metronome stopped');
    }

    /**
     * 音量設定
     */
    public setVolume(volume: number): void {
        this.state.volume = Math.max(0, Math.min(1, volume));
        console.log(`🔊 Metronome volume: ${(this.state.volume * 100).toFixed(0)}%`);
    }

    /**
     * テンポ設定
     */
    public setTempo(bpm: number, numerator: number, denominator: number): void {
        this.state.tempo = { bpm, numerator, denominator };
        console.log(`🎵 Metronome tempo: ${bpm} BPM, ${numerator}/${denominator}`);
    }

    /**
     * 状態取得
     */
    public getState(): MetronomeState {
        return { ...this.state };
    }

    /**
     * テスト用拍パターン再生
     */
    public playTestPattern(): void {
        console.log('🧪 Playing metronome test pattern...');

        let beat = 1;
        let bar = 1;

        const playBeat = () => {
            if (beat <= 4) {
                this.triggerBeat(bar, beat);
                beat++;
                setTimeout(playBeat, 500); // 120 BPMの間隔
            } else {
                beat = 1;
                bar++;
                if (bar <= 2) {
                    setTimeout(playBeat, 500);
                } else {
                    console.log('✅ Test pattern completed');
                }
            }
        };

        this.start();
        playBeat();
    }

    /**
     * ビートを先行スケジュール（ルックアヘッド用）
     */
    public scheduleBeatsAhead(_bar: number, beat: number, subdivision: number, scheduledTime: number): void {
        if (!this.state.isActive) return;

        // scheduledTime はAudioContextの絶対時間として受け取る
        const audioWhen = scheduledTime;

        if (this.useFaustDSP && this.faustNode) {
            const delayMs = Math.max(0, (audioWhen - this.audioContext.currentTime) * 1000);

            const timeoutId = setTimeout(() => {
                if (!this.state.isActive || !this.faustNode) return;

                const beatType = beat === 1
                    ? this.BEAT_TYPES.DOWNBEAT
                    : subdivision > 0
                        ? this.BEAT_TYPES.SUBDIVISION
                        : (this.state.tempo.numerator >= 4 && beat === 3)
                            ? this.BEAT_TYPES.STRONG_BEAT
                            : this.BEAT_TYPES.WEAK_BEAT;

                this.faustNode.setParamValue("/metronome/beat_type", beatType);
                this.faustNode.setParamValue("/metronome/volume", this.state.volume);
                this.faustNode.setParamValue("/metronome/trigger", 1);

                setTimeout(() => {
                    if (this.faustNode) {
                        this.faustNode.setParamValue("/metronome/trigger", 0);
                    }
                }, 10);

                this.scheduledFaustTriggers = this.scheduledFaustTriggers.filter(id => id !== timeoutId);
            }, delayMs) as unknown as number;

            this.scheduledFaustTriggers.push(timeoutId);
            return;
        }

        // ビートタイプ分類
        let frequency: number;
        let volume: number;
        let duration: number;

        if (beat === 1) {
            // DOWNBEAT
            frequency = 880;
            volume = 1.0;
            duration = 0.15;
        } else if (this.state.tempo.numerator >= 4 && beat === 3) {
            // STRONG_BEAT
            frequency = 660;
            volume = 0.7;
            duration = 0.1;
        } else if (subdivision > 0) {
            // SUBDIVISION
            frequency = 330;
            volume = 0.4;
            duration = 0.05;
        } else {
            // WEAK_BEAT
            frequency = 440;
            volume = 0.5;
            duration = 0.08;
        }

        // オーディオノードを事前にスケジュール
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.frequency.setValueAtTime(frequency, audioWhen);
        gainNode.gain.setValueAtTime(0, audioWhen);
        gainNode.gain.linearRampToValueAtTime(volume * this.state.volume, audioWhen + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioWhen + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start(audioWhen);
        oscillator.stop(audioWhen + duration);

        // ログは省略（先行スケジュール時は静かに）
    }
}
