/**
 * LiveMixer - ライブパフォーマンス用の統合ミキサーシステム
 *
 * Phase 5: Live Electronics Performance System のコアコンポーネント
 * UR22C入力、内部シンセ、Clickトラックを統合管理
 */

// import { TrackManager } from './trackManager'; // TODO: TrackManager実装後に有効化
import { LogicInputManager } from './logicInputs';
// import { BusManager } from './busManager'; // TODO: 将来のバス管理統合時に有効化

export interface LiveMixerChannel {
    id: string;
    name: string;
    trackId: string;  // 対応するTrack ID
    inputNode: AudioNode;
    volumeGain: GainNode;
    panNode: StereoPannerNode;
    effectsChain: AudioNode[];
    outputNode: AudioNode;
    muted: boolean;
    solo: boolean;
    userVolume?: number;  // ユーザー設定音量
    analyser?: AnalyserNode;
    levelMeter?: LevelMeter;
}

export interface LevelMeter {
    update(): { peak: number; rms: number };
    getFrequencyData(): Uint8Array;
}

// 仮のTrackManagerインターフェース（TrackManager実装後に置き換え）
interface TrackManager {
    createTrack(options: any): Promise<any>;
    getTrack(trackId: string): Promise<any>;
}

export class LiveMixer {
    private channels = new Map<string, LiveMixerChannel>();
    private masterBus!: GainNode;
    private effectsBus!: GainNode;
    private monitorBus!: GainNode;
    private trackManager: TrackManager;
    private logicInputManager: LogicInputManager;
    // private busManager: BusManager; // TODO: 将来のバス管理統合時に有効化
    private audioContext: AudioContext;

    constructor(
        audioContext: AudioContext,
        trackManager: TrackManager,
        logicInputManager: LogicInputManager
        // busManager: BusManager // TODO: 将来のバス管理統合時に有効化
    ) {
        this.audioContext = audioContext;
        this.trackManager = trackManager;
        this.logicInputManager = logicInputManager;
        // this.busManager = busManager;

        this.initializeBuses();
        console.log('🎛️ LiveMixer initialized');
    }

    /**
     * マスターバス、エフェクトバス、モニターバスの初期化
     */
    private initializeBuses(): void {
        // マスターバス（最終出力）
        this.masterBus = this.audioContext.createGain();
        this.masterBus.gain.value = 1.0;
        this.masterBus.connect(this.audioContext.destination);

        // エフェクトバス
        this.effectsBus = this.audioContext.createGain();
        this.effectsBus.gain.value = 1.0;
        this.effectsBus.connect(this.masterBus);

        // モニターバス（パフォーマー用）
        this.monitorBus = this.audioContext.createGain();
        this.monitorBus.gain.value = 0.8; // モニターは少し低めに
        this.monitorBus.connect(this.audioContext.destination);

        console.log('🔌 LiveMixer buses initialized');
    }

    /**
     * UR22C入力の自動検出とチャンネル作成
     */
    async setupUR22CInputs(): Promise<void> {
        console.log('🔍 Detecting UR22C inputs...');

        try {
            // LogicInputManagerからUR22C関連の入力を取得
            const logicInputs = this.logicInputManager.list();
            const ur22cInputs = logicInputs.filter(input =>
                input.label.toLowerCase().includes('ur22c') ||
                input.label.toLowerCase().includes('ur-22c')
            );

            if (ur22cInputs.length === 0) {
                console.warn('⚠️ No UR22C inputs detected');
                return;
            }

            console.log(`🎤 Found ${ur22cInputs.length} UR22C inputs`);

            // 各UR22C入力に対してチャンネルを作成
            for (const input of ur22cInputs) {
                await this.createChannelFromLogicInput(input.id, input.label);
            }

        } catch (error) {
            console.error('❌ Failed to setup UR22C inputs:', error);
        }
    }

    /**
     * 内部シンセのセットアップ
     */
    async setupInternalSynth(): Promise<void> {
        console.log('🎹 Setting up internal synthesizer...');

        try {
            // Faust DSPシンセのTrackを作成
            const synthTrack = await this.trackManager.createTrack({
                kind: 'faust',
                name: 'Internal Synth',
                inputSource: 'faust-synth'
            });

            await this.createChannelFromTrack(synthTrack.id, 'Internal Synth');
            console.log('✅ Internal synthesizer ready');

        } catch (error) {
            console.error('❌ Failed to setup internal synthesizer:', error);
        }
    }

    /**
     * Clickトラックのセットアップ
     */
    async setupClickTrack(): Promise<void> {
        console.log('🥁 Setting up click track...');

        try {
            // ClickトラックのTrackを作成
            const clickTrack = await this.trackManager.createTrack({
                kind: 'custom',
                name: 'Click',
                inputSource: 'metronome'
            });

            await this.createChannelFromTrack(clickTrack.id, 'Click');

            // モニター出力にルーティング
            this.routeToMonitor(clickTrack.id);
            console.log('✅ Click track ready');

        } catch (error) {
            console.error('❌ Failed to setup click track:', error);
        }
    }

    /**
     * LogicInputからチャンネルを作成
     */
    private async createChannelFromLogicInput(logicInputId: string, channelName: string): Promise<LiveMixerChannel> {
        console.log(`🎚️ Creating channel from LogicInput: ${channelName}`);

        // LogicInputに対応するTrackを作成または取得
        let trackId: string;

        const logicInput = this.logicInputManager.list().find(li => li.id === logicInputId);
        if (!logicInput) {
            throw new Error(`LogicInput not found: ${logicInputId}`);
        }

        if (logicInput.trackId) {
            // 既存のTrackを使用
            trackId = logicInput.trackId;
        } else {
            // 新しいTrackを作成
            const track = await this.trackManager.createTrack({
                kind: 'mic',
                name: channelName,
                inputSource: logicInputId
            });
            trackId = track.id;

            // LogicInputにTrack IDを関連付け
            this.logicInputManager.setTrackId(logicInputId, trackId);
        }

        return this.createChannelFromTrack(trackId, channelName);
    }

    /**
     * Trackからチャンネルを作成
     */
    private async createChannelFromTrack(trackId: string, channelName: string): Promise<LiveMixerChannel> {
        const track = await this.trackManager.getTrack(trackId);
        if (!track) {
            throw new Error(`Track not found: ${trackId}`);
        }

        // LiveMixerChannelの作成
        const channel: LiveMixerChannel = {
            id: `channel_${trackId}`,
            name: channelName,
            trackId: trackId,
            inputNode: track.inputNode,
            volumeGain: track.volumeGain,
            panNode: this.audioContext.createStereoPanner(),
            effectsChain: [],
            outputNode: track.outputNode,
            muted: false,
            solo: false,
            analyser: this.createAnalyser(),
            levelMeter: this.createLevelMeter(track.analyser)
        };

        // パン設定と接続
        channel.panNode.pan.value = 0; // センター
        channel.panNode.connect(channel.volumeGain);

        // デフォルトでマスターバスに接続
        channel.outputNode.connect(this.masterBus);

        this.channels.set(channel.id, channel);
        console.log(`✅ Channel created: ${channelName} (${channel.id})`);

        return channel;
    }

    /**
     * アナライザー作成
     */
    private createAnalyser(): AnalyserNode {
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        return analyser;
    }

    /**
     * レベルメーター作成
     */
    private createLevelMeter(analyser?: AnalyserNode): LevelMeter {
        if (!analyser) {
            analyser = this.createAnalyser();
        }

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        return {
            update: () => {
                analyser!.getByteFrequencyData(dataArray);

                // RMSとピークの計算
                let sum = 0;
                let peak = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const value = dataArray[i] / 255.0; // 0-1に正規化
                    sum += value * value;
                    if (value > peak) peak = value;
                }

                const rms = Math.sqrt(sum / bufferLength);
                return { peak, rms };
            },

            getFrequencyData: () => {
                analyser!.getByteFrequencyData(dataArray);
                return new Uint8Array(dataArray);
            }
        };
    }

    /**
     * チャンネルをモニターバスにルーティング
     */
    routeToMonitor(channelId: string): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        // 既存の接続を切断
        try { channel.outputNode.disconnect(); } catch { }

        // モニターバスに接続
        channel.outputNode.connect(this.monitorBus);
        console.log(`🎧 Channel ${channel.name} routed to monitor bus`);
    }

    /**
     * チャンネルをマスターバスにルーティング
     */
    routeToMaster(channelId: string): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        // 既存の接続を切断
        try { channel.outputNode.disconnect(); } catch { }

        // マスターバスに接続
        channel.outputNode.connect(this.masterBus);
        console.log(`🎛️ Channel ${channel.name} routed to master bus`);
    }

    /**
     * チャンネルのミュート切り替え
     */
    toggleMute(channelId: string): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.muted = !channel.muted;
        channel.volumeGain.gain.value = channel.muted ? 0 : (channel.userVolume || 1);
        console.log(`🔇 Channel ${channel.name} ${channel.muted ? 'muted' : 'unmuted'}`);
    }

    /**
     * チャンネルのソロ切り替え
     */
    toggleSolo(channelId: string): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.solo = !channel.solo;
        this.updateSoloState();
        console.log(`🎯 Channel ${channel.name} ${channel.solo ? 'solo on' : 'solo off'}`);
    }

    /**
     * ソロ状態の更新（他のチャンネルのミュート状態を更新）
     */
    private updateSoloState(): void {
        const anySolo = Array.from(this.channels.values()).some(ch => ch.solo);

        for (const channel of this.channels.values()) {
            if (anySolo) {
                // ソロがオンになっているチャンネルがある場合
                const shouldBeAudible = channel.solo || !anySolo;
                channel.volumeGain.gain.value = shouldBeAudible ? (channel.userVolume || 1) : 0;
            } else {
                // ソロがオフの場合
                channel.volumeGain.gain.value = channel.muted ? 0 : (channel.userVolume || 1);
            }
        }
    }

    /**
     * チャンネルの音量設定
     */
    setChannelVolume(channelId: string, volume: number): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.userVolume = Math.max(0, Math.min(1, volume));
        if (!channel.muted) {
            channel.volumeGain.gain.value = channel.userVolume;
        }
        console.log(`🔊 Channel ${channel.name} volume: ${Math.round(volume * 100)}%`);
    }

    /**
     * チャンネルのパン設定
     */
    setChannelPan(channelId: string, pan: number): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.panNode.pan.value = Math.max(-1, Math.min(1, pan));
        console.log(`🎚️ Channel ${channel.name} pan: ${pan > 0 ? 'R' : pan < 0 ? 'L' : 'C'}`);
    }

    /**
     * マスター音量設定
     */
    setMasterVolume(volume: number): void {
        this.masterBus.gain.value = Math.max(0, Math.min(1, volume));
        console.log(`🎛️ Master volume: ${Math.round(volume * 100)}%`);
    }

    /**
     * モニター音量設定
     */
    setMonitorVolume(volume: number): void {
        this.monitorBus.gain.value = Math.max(0, Math.min(1, volume));
        console.log(`🎧 Monitor volume: ${Math.round(volume * 100)}%`);
    }

    /**
     * 全チャンネルの取得
     */
    getChannels(): LiveMixerChannel[] {
        return Array.from(this.channels.values());
    }

    /**
     * 特定のチャンネルの取得
     */
    getChannel(channelId: string): LiveMixerChannel | undefined {
        return this.channels.get(channelId);
    }

    /**
     * 全チャンネルのレベル情報を取得
     */
    getAllLevels(): Record<string, { peak: number; rms: number }> {
        const levels: Record<string, { peak: number; rms: number }> = {};

        for (const channel of this.channels.values()) {
            if (channel.levelMeter) {
                levels[channel.id] = channel.levelMeter.update();
            }
        }

        return levels;
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        for (const channel of this.channels.values()) {
            try { channel.outputNode.disconnect(); } catch { }
            try { channel.panNode.disconnect(); } catch { }
            if (channel.analyser) {
                try { channel.analyser.disconnect(); } catch { }
            }
        }

        try { this.masterBus.disconnect(); } catch { }
        try { this.effectsBus.disconnect(); } catch { }
        try { this.monitorBus.disconnect(); } catch { }

        this.channels.clear();
        console.log('🗑️ LiveMixer disposed');
    }
}
