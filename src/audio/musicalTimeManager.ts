/**
 * MusicalTimeManager - 現代音楽のための音楽的時間軸制御エンジン
 * 
 * 機能:
 * - テンポ・拍子・小節ベースの時間制御
 * - 複雑拍子・テンポ変化対応
 * - リアルタイムスケジューリング
 * - パフォーマンス記述の実行制御
 * - メトロノーム機能による拍の可視化・可聴化
 */

import { FaustMetronome } from './dsp/faustMetronome';

// 音楽的時間の型定義
export type MusicalTime =
    | { type: 'absolute', seconds: number }           // 絶対時間: 125.5秒
    | { type: 'musical', bars: number, beats: number, subdivisions?: number, tempo?: TempoInfo } // 音楽時間: 32小節2拍目
    | { type: 'musical_with_tempo', bars: number, beats: number, subdivisions?: number, tempo: TempoInfo } // テンポ指定付き音楽時間
    | { type: 'tempo_relative', beats: number, tempo?: TempoInfo }       // テンポ相対: 64拍後
    | { type: 'trigger_wait', triggerId: string }     // トリガー待ち: "soloist_phrase_end"
    | { type: 'conductor_cue', cueId: string }        // 指揮者キュー: "section_B_start"
    | { type: 'conductor_cue', cueId: string }        // 指揮者キュー: "section_B_start"

// テンポ情報
export interface TempoInfo {
    bpm: number;
    numerator: number;    // 拍子の分子 (4/4なら4)
    denominator: number;  // 拍子の分母 (4/4なら4)
    subdivision?: number; // 細分化 (16分音符なら16)
}

// パフォーマンスイベント
export interface PerformanceEvent {
    id: string;
    time: MusicalTime;
    type: 'audio' | 'visual' | 'cue' | 'control' | 'external';
    action: string;
    parameters?: Record<string, any>;
    description?: string;
}

// キューイベント
export interface CueEvent {
    id: string;
    name: string;
    time: MusicalTime;
    target: 'performer' | 'operator' | 'all';
    message: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
}

// テンポ変化イベント
export interface TempoChangeEvent {
    time: MusicalTime;
    newTempo: TempoInfo;
    transitionType: 'immediate' | 'gradual';
    transitionDuration?: MusicalTime; // gradualの場合の移行時間
}

export interface BeatTimingSample {
    bar: number;
    beat: number;
    scheduledTime: number;   // 理論上予定される絶対時刻 (sec, startTime基準)
    actualTime: number;      // audioContext.currentTime 基準実測
    driftMs: number;         // (actualTime - scheduledTime)*1000
}

export interface BeatTimingStats {
    samples: BeatTimingSample[];
    count: number;
    meanDriftMs: number;
    maxDriftMs: number;
    minDriftMs: number;
    stdDevMs: number;
}

export class MusicalTimeManager {
    private currentTempo: TempoInfo;
    private startTime: number; // AudioContext時間での開始時刻
    private currentBar: number = 1;
    private currentBeat: number = 1;
    private isPlaying: boolean = false;
    private audioContext: AudioContext;

    // メトロノーム機能
    private metronome: FaustMetronome;
    private metronomeEnabled: boolean = false;

    // イベントスケジューリング
    private scheduledEvents: Map<string, PerformanceEvent> = new Map();
    private cueEvents: Map<string, CueEvent> = new Map();

    // テンポ履歴管理
    private tempoHistory: Array<{ time: number, tempo: TempoInfo }> = [];

    // TODO: テンポ変化システムは将来実装
    // private tempoChanges: TempoChangeEvent[] = [];

    // コールバック
    private onBeatCallback?: (bar: number, beat: number) => void;
    private onCueCallback?: (cue: CueEvent) => void;
    private onEventCallback?: (event: PerformanceEvent) => void;

    // 計測関連
    private beatTimingEnabled: boolean = false;
    private beatTimingSamples: BeatTimingSample[] = [];
    private beatTimingMaxSamples = 512;

    // 拍関連
    private beatIntervalSec: number = 0; // 1拍の秒数 (bpm変更毎に更新)
    private nextBeatScheduledTime: number = 0; // startTime基準の次拍予定時刻 (absolute time)

    // ルックアヘッドスケジューラ関連
    private lookAheadTime: number = 0.1; // 100ms先まで予約
    private scheduleTickInterval: number = 10; // 10ms間隔でチェック
    private schedulerTimerId: number | null = null;

    // 高精度コールバックスケジューリング
    private scheduledCallbacks: Array<{
        executeTime: number; // AudioContext絶対時間
        callback: () => void;
    }> = [];
    private highPrecisionTimerId: number | null = null;

    constructor(audioContext: AudioContext, initialTempo: TempoInfo = {
        bpm: 120,
        numerator: 4,
        denominator: 4
    }) {
        this.audioContext = audioContext;
        this.currentTempo = initialTempo;
        this.startTime = audioContext.currentTime;

        // メトロノーム初期化
        this.metronome = new FaustMetronome(audioContext);
        this.metronome.setTempo(initialTempo.bpm, initialTempo.numerator, initialTempo.denominator);

        console.log('🎼 MusicalTimeManager initialized', {
            tempo: `${initialTempo.bpm} BPM`,
            timeSignature: `${initialTempo.numerator}/${initialTempo.denominator}`,
            metronome: 'ready'
        });
    }

    /**
     * 演奏開始
     */
    start(): void {
        if (this.isPlaying) {
            console.warn('MusicalTimeManager: Already playing');
            return;
        }

        this.startTime = this.audioContext.currentTime;
        this.currentBar = 1;
        this.currentBeat = 1;
        this.isPlaying = true;
        this.beatIntervalSec = 60 / this.currentTempo.bpm;
        this.nextBeatScheduledTime = this.beatIntervalSec; // 次の拍（2拍目）のスケジュール時間（相対時間）

        console.log(`🎼 Musical time started - Tempo: ${this.currentTempo.bpm} BPM, Time Signature: ${this.currentTempo.numerator}/${this.currentTempo.denominator}`);

        // 初回拍を即時通知（メトロノーム/コールバック起動用）
        this.notifyBeat(1, 1, 0, 0); // 初回 (scheduledTime=0, 相対時間)

        // スケジューリングループ開始
        this.scheduleNextEvents();
    }

    /**
     * 演奏停止
     */
    stop(): void {
        this.isPlaying = false;
        // ルックアヘッドスケジューラーを停止
        if (this.schedulerTimerId !== null) {
            clearTimeout(this.schedulerTimerId);
            this.schedulerTimerId = null;
        }
        // 高精度タイマーを停止
        if (this.highPrecisionTimerId !== null) {
            clearInterval(this.highPrecisionTimerId);
            this.highPrecisionTimerId = null;
        }
        // スケジュール済みコールバックをクリア
        this.scheduledCallbacks.length = 0;
        console.log('🛑 Musical time stopped');
    }

    /**
     * 一時停止
     */
    pause(): void {
        this.isPlaying = false;
        console.log('⏸️ Musical time paused');
    }

    /**
     * 高精度コールバックをスケジュール
     */
    private scheduleHighPrecisionCallback(executeTime: number, callback: () => void): void {
        this.scheduledCallbacks.push({ executeTime, callback });

        // 高精度タイマーが動いていなければ開始
        if (this.highPrecisionTimerId === null) {
            this.startHighPrecisionTimer();
        }
    }

    /**
     * 高精度タイマーを開始
     */
    private startHighPrecisionTimer(): void {
        this.highPrecisionTimerId = setInterval(() => {
            const currentTime = this.audioContext.currentTime;

            // 実行時刻に達したコールバックを処理
            const toExecute = this.scheduledCallbacks.filter(item => item.executeTime <= currentTime);

            toExecute.forEach(item => {
                try {
                    item.callback();
                } catch (error) {
                    console.error('High precision callback error:', error);
                }
            });

            // 実行済みを削除
            this.scheduledCallbacks = this.scheduledCallbacks.filter(item => item.executeTime > currentTime);

            // コールバックがなくなったらタイマーを停止
            if (this.scheduledCallbacks.length === 0) {
                if (this.highPrecisionTimerId !== null) {
                    clearInterval(this.highPrecisionTimerId);
                    this.highPrecisionTimerId = null;
                }
            }
        }, 1) as unknown as number; // 1ms間隔で最高精度
    }

    /**
     * 再開
     */
    resume(): void {
        if (this.isPlaying) return;

        // 現在の音楽的位置を保持して再開
        this.startTime = this.audioContext.currentTime - this.getCurrentAbsoluteTime();
        this.isPlaying = true;

        console.log('▶️ Musical time resumed');
        this.scheduleNextEvents();
    }

    /**
     * テンポ変更
     */
    setTempo(newTempo: TempoInfo, immediate: boolean = true): void {
        if (immediate) {
            this.currentTempo = newTempo;
            // テンポ履歴に記録
            this.tempoHistory.push({
                time: this.getCurrentAbsoluteTime(),
                tempo: newTempo
            });

            // メトロノームのテンポも更新
            this.metronome.setTempo(newTempo.bpm, newTempo.numerator, newTempo.denominator);
            this.beatIntervalSec = 60 / newTempo.bpm; // 更新

            console.log(`🎵 Tempo changed to ${newTempo.bpm} BPM, ${newTempo.numerator}/${newTempo.denominator}`);
        } else {
            // グラデュアルなテンポ変更は将来実装
            console.warn('Gradual tempo changes not yet implemented');
        }
    }

    /**
     * 指定した時間のテンポを取得
     */
    getTempoAtTime(absoluteTime: number): TempoInfo {
        // テンポヒストリーから指定時間での有効なテンポを検索
        let effectiveTempo = this.currentTempo;

        for (let i = this.tempoHistory.length - 1; i >= 0; i--) {
            if (this.tempoHistory[i].time <= absoluteTime) {
                effectiveTempo = this.tempoHistory[i].tempo;
                break;
            }
        }

        return effectiveTempo;
    }

    /**
     * テンポ変更がある場合の音楽的時間計算
     */
    musicalTimeToAbsoluteWithTempoChanges(musicalTime: MusicalTime): number {
        if (musicalTime.type === 'absolute') {
            return musicalTime.seconds;
        }

        if (musicalTime.type === 'musical_with_tempo') {
            // 明示的なテンポ指定がある場合
            return this.musicalTimeToAbsolute(musicalTime);
        }

        // テンポ変更履歴を考慮した計算
        let currentAbsoluteTime = 0;
        let remainingBeats = this.calculateTotalBeats(musicalTime);

        for (const tempoChange of this.tempoHistory) {
            if (remainingBeats <= 0) break;

            const tempo = tempoChange.tempo;
            const beatsInThisSegment = Math.min(remainingBeats, this.getBeatsUntilNextTempoChange(tempoChange));
            const timeForThisSegment = (beatsInThisSegment * 60) / tempo.bpm;

            currentAbsoluteTime += timeForThisSegment;
            remainingBeats -= beatsInThisSegment;
        }

        return currentAbsoluteTime;
    }

    /**
     * 音楽的時間から総拍数を計算
     */
    private calculateTotalBeats(musicalTime: MusicalTime): number {
        switch (musicalTime.type) {
            case 'musical':
                const tempo = musicalTime.tempo || this.currentTempo;
                const beatsPerBar = tempo.numerator;
                const totalBeats = (musicalTime.bars - 1) * beatsPerBar + (musicalTime.beats - 1);
                const subdivisionOffset = (musicalTime.subdivisions || 0) / (tempo.subdivision || 4);
                return totalBeats + subdivisionOffset;

            case 'tempo_relative':
                return musicalTime.beats;

            default:
                return 0;
        }
    }

    /**
     * 次のテンポ変更まで何拍あるかを計算
     */
    private getBeatsUntilNextTempoChange(_currentTempoChange: any): number {
        // 簡略化のため、大きな値を返す（実際の実装では次のテンポ変更を検索）
        return 1000;
    }

    /**
     * 現在の音楽的位置取得
     */
    getCurrentMusicalPosition(): { bar: number, beat: number, subdivision: number } {
        if (!this.isPlaying) {
            return { bar: this.currentBar, beat: this.currentBeat, subdivision: 0 };
        }

        const elapsedSeconds = this.audioContext.currentTime - this.startTime;
        const beatsPerSecond = this.currentTempo.bpm / 60;
        const totalBeats = elapsedSeconds * beatsPerSecond;

        const beatsPerBar = this.currentTempo.numerator;
        const bars = Math.floor(totalBeats / beatsPerBar) + 1;
        const beats = Math.floor(totalBeats % beatsPerBar) + 1;
        const subdivision = Math.floor(((totalBeats % 1) * (this.currentTempo.subdivision || 4)));

        // BUG FIX: 以前はここで this.currentBar / this.currentBeat を更新していたため
        // scheduleNextEvents 内の差分検出が常に false になり notifyBeat が呼ばれなかった。
        // 内部状態更新は scheduleNextEvents 内の差分確定時にのみ行うようにする。

        return { bar: bars, beat: beats, subdivision };
    }

    /**
     * 現在のテンポ情報を取得
     */
    getCurrentTempo(): TempoInfo {
        return this.currentTempo;
    }

    /**
     * メトロノーム有効化
     */
    enableMetronome(): void {
        this.metronomeEnabled = true;
        this.metronome.start();
        console.log('🥁 Metronome enabled');
    }

    /**
     * メトロノーム無効化
     */
    disableMetronome(): void {
        this.metronomeEnabled = false;
        this.metronome.stop();
        console.log('🔇 Metronome disabled');
    }

    /**
     * メトロノーム音量設定
     */
    setMetronomeVolume(volume: number): void {
        this.metronome.setVolume(volume);
    }

    /**
     * メトロノームテストパターン再生
     */
    playMetronomeTest(): void {
        this.metronome.playTestPattern();
    }

    /**
     * 現在の絶対時間取得（秒）
     */
    getCurrentAbsoluteTime(): number {
        if (!this.isPlaying) return 0;
        return this.audioContext.currentTime - this.startTime;
    }

    /**
     * 音楽的時間を絶対時間に変換
     */
    musicalTimeToAbsolute(musicalTime: MusicalTime): number {
        switch (musicalTime.type) {
            case 'absolute':
                return musicalTime.seconds;

            case 'musical':
                // テンポ指定がある場合はそれを使用、なければ現在のテンポ
                const tempo = musicalTime.tempo || this.currentTempo;
                const beatsPerBar = tempo.numerator;
                const totalBeats = (musicalTime.bars - 1) * beatsPerBar + (musicalTime.beats - 1);
                const subdivisionOffset = (musicalTime.subdivisions || 0) / (tempo.subdivision || 4);
                const totalBeatsWithSubdivision = totalBeats + subdivisionOffset;

                return (totalBeatsWithSubdivision * 60) / tempo.bpm;

            case 'musical_with_tempo':
                // 明示的にテンポが指定された音楽的時間
                const specifiedTempo = musicalTime.tempo;
                const beatsPerBarWithTempo = specifiedTempo.numerator;
                const totalBeatsWithTempo = (musicalTime.bars - 1) * beatsPerBarWithTempo + (musicalTime.beats - 1);
                const subdivisionOffsetWithTempo = (musicalTime.subdivisions || 0) / (specifiedTempo.subdivision || 4);
                const totalBeatsWithSubdivisionAndTempo = totalBeatsWithTempo + subdivisionOffsetWithTempo;

                return (totalBeatsWithSubdivisionAndTempo * 60) / specifiedTempo.bpm;

            case 'tempo_relative':
                // テンポ指定がある場合はそれを使用、なければ現在のテンポ
                const relativeTempoInfo = musicalTime.tempo || this.currentTempo;
                return (musicalTime.beats * 60) / relativeTempoInfo.bpm;

            case 'trigger_wait':
            case 'conductor_cue':
                // これらは外部トリガー待ちなので、現在時刻を返す
                return this.getCurrentAbsoluteTime();

            default:
                console.warn('Unknown musical time type');
                return 0;
        }
    }

    /**
     * パフォーマンスイベントのスケジューリング
     */
    scheduleEvent(event: PerformanceEvent): void {
        const absoluteTime = this.musicalTimeToAbsolute(event.time);

        // 外部トリガー・キュー待ちの場合は即座に待機状態にする
        if (event.time.type === 'trigger_wait' || event.time.type === 'conductor_cue') {
            this.scheduledEvents.set(event.id, event);
            console.log(`⏳ Event "${event.id}" waiting for trigger: ${event.time.type === 'trigger_wait' ? event.time.triggerId : event.time.cueId}`);
            return;
        }

        // 通常のタイムベースイベント
        this.scheduledEvents.set(event.id, event);

        const currentTime = this.getCurrentAbsoluteTime();
        const timeUntilEvent = absoluteTime - currentTime;

        if (timeUntilEvent > 0) {
            setTimeout(() => {
                this.executeEvent(event);
            }, timeUntilEvent * 1000);

            console.log(`📅 Event "${event.id}" scheduled for ${absoluteTime.toFixed(2)}s (in ${timeUntilEvent.toFixed(2)}s)`);
        } else {
            // 既に過ぎた時間の場合は即座に実行
            this.executeEvent(event);
        }
    }

    /**
     * キューイベントのスケジューリング
     */
    scheduleCue(cue: CueEvent): void {
        this.cueEvents.set(cue.id, cue);

        const absoluteTime = this.musicalTimeToAbsolute(cue.time);
        const currentTime = this.getCurrentAbsoluteTime();
        const timeUntilCue = absoluteTime - currentTime;

        if (timeUntilCue > 0) {
            setTimeout(() => {
                this.executeCue(cue);
            }, timeUntilCue * 1000);

            console.log(`🎯 Cue "${cue.name}" scheduled for ${absoluteTime.toFixed(2)}s`);
        } else {
            this.executeCue(cue);
        }
    }

    /**
     * 外部トリガーの発火
     */
    triggerEvent(triggerId: string): void {
        // trigger_wait イベントを検索して実行
        for (const [eventId, event] of this.scheduledEvents) {
            if (event.time.type === 'trigger_wait' && event.time.triggerId === triggerId) {
                console.log(`🔥 Trigger "${triggerId}" fired, executing event "${eventId}"`);
                this.executeEvent(event);
                this.scheduledEvents.delete(eventId);
            }
        }

        // trigger_wait キューも同様に処理
        for (const [cueId, cue] of this.cueEvents) {
            if (cue.time.type === 'trigger_wait' && cue.time.triggerId === triggerId) {
                console.log(`🔥 Trigger "${triggerId}" fired, executing cue "${cueId}"`);
                this.executeCue(cue);
                this.cueEvents.delete(cueId);
            }
        }
    }

    /**
     * 指揮者キューの発火
     */
    conductorCue(cueId: string): void {
        // conductor_cue イベントを検索して実行
        for (const [eventId, event] of this.scheduledEvents) {
            if (event.time.type === 'conductor_cue' && event.time.cueId === cueId) {
                console.log(`🎭 Conductor cue "${cueId}" fired, executing event "${eventId}"`);
                this.executeEvent(event);
                this.scheduledEvents.delete(eventId);
            }
        }

        // conductor_cue キューも同様に処理
        for (const [cueEventId, cue] of this.cueEvents) {
            if (cue.time.type === 'conductor_cue' && cue.time.cueId === cueId) {
                console.log(`🎭 Conductor cue "${cueId}" fired, executing cue "${cueEventId}"`);
                this.executeCue(cue);
                this.cueEvents.delete(cueEventId);
            }
        }
    }

    /**
     * イベント実行
     */
    private executeEvent(event: PerformanceEvent): void {
        console.log(`🎬 Executing event: ${event.id} (${event.type}: ${event.action})`);

        if (this.onEventCallback) {
            this.onEventCallback(event);
        }

        // イベント完了後に削除
        this.scheduledEvents.delete(event.id);
    }

    /**
     * キュー実行
     */
    private executeCue(cue: CueEvent): void {
        console.log(`🎯 Executing cue: ${cue.name} (${cue.target}: ${cue.message})`);

        if (this.onCueCallback) {
            this.onCueCallback(cue);
        }

        // キュー完了後に削除
        this.cueEvents.delete(cue.id);
    }

    /**
     * 次のイベントをスケジューリング（ルックアヘッドスケジューラ版）
     */
    private scheduleNextEvents(): void {
        if (!this.isPlaying) return;

        const currentTime = this.getCurrentAbsoluteTime();
        const scheduleUntilTime = currentTime + this.lookAheadTime;

        // ルックアヘッド時間内のすべての拍をスケジュール
        while (this.nextBeatScheduledTime <= scheduleUntilTime) {
            // 現在時刻よりも先のビートのみを処理
            if (this.nextBeatScheduledTime > currentTime) {
                // 次の拍計算
                let nextBeat = this.currentBeat + 1;
                let nextBar = this.currentBar;
                if (nextBeat > this.currentTempo.numerator) {
                    nextBeat = 1;
                    nextBar += 1;
                }

                // ビートスケジュール (メトロノーム音を先行予約)
                if (this.metronomeEnabled) {
                    // scheduleBeatsAhead が存在しない場合は従来通り
                    if ((this.metronome as any).scheduleBeatsAhead) {
                        // 相対時間を絶対時間に変換して渡す
                        const absoluteScheduleTime = this.startTime + this.nextBeatScheduledTime;
                        (this.metronome as any).scheduleBeatsAhead(nextBar, nextBeat, 0, absoluteScheduleTime);
                    }
                }

                // コールバックは実際のビート時刻に合わせて高精度スケジューリング
                const absoluteCallbackTime = this.startTime + this.nextBeatScheduledTime;
                const scheduledBeatTime = this.nextBeatScheduledTime; // スケジュール時間を保存
                this.scheduleHighPrecisionCallback(absoluteCallbackTime, () => {
                    if (this.isPlaying) { // 停止チェック
                        this.currentBar = nextBar;
                        this.currentBeat = nextBeat;
                        this.notifyBeat(nextBar, nextBeat, 0, scheduledBeatTime);
                    }
                });
            }

            this.nextBeatScheduledTime += this.beatIntervalSec;
        }

        // 短周期で再実行
        this.schedulerTimerId = setTimeout(() => this.scheduleNextEvents(), this.scheduleTickInterval) as unknown as number;
    }

    /**
     * 内部拍通知（メトロノーム連携）
     */
    private notifyBeat(bar: number, beat: number, _subdivision: number = 0, scheduledTimeSec?: number): void {
        // 計測: scheduledTimeSec が与えられた場合ドリフト記録
        if (this.beatTimingEnabled && typeof scheduledTimeSec === 'number') {
            const actual = this.getCurrentAbsoluteTime();
            const driftMs = (actual - scheduledTimeSec) * 1000;
            this.beatTimingSamples.push({
                bar,
                beat,
                scheduledTime: scheduledTimeSec,
                actualTime: actual,
                driftMs
            });
            if (this.beatTimingSamples.length > this.beatTimingMaxSamples) {
                this.beatTimingSamples.shift();
            }
            console.log(`⏱️ Drift b${bar}:${beat} ${driftMs.toFixed(2)}ms (scheduled=${scheduledTimeSec.toFixed(3)}s actual=${actual.toFixed(3)}s)`);
        }

        // メトロノーム連携は scheduleBeatsAhead で既に処理済みのため、ここでは triggerBeat を呼ばない
        // (二重実行を避けるため)

        // ユーザーコールバック実行
        if (this.onBeatCallback) {
            this.onBeatCallback(bar, beat);
        }
    }

    /**
     * コールバック設定
     */
    onBeat(callback: (bar: number, beat: number) => void): void {
        this.onBeatCallback = callback;
    }

    onCue(callback: (cue: CueEvent) => void): void {
        this.onCueCallback = callback;
    }

    onEvent(callback: (event: PerformanceEvent) => void): void {
        this.onEventCallback = callback;
    }

    /**
     * 現在の状態取得
     */
    getStatus() {
        const position = this.getCurrentMusicalPosition();
        return {
            isPlaying: this.isPlaying,
            currentTempo: this.currentTempo,
            position,
            absoluteTime: this.getCurrentAbsoluteTime(),
            scheduledEventsCount: this.scheduledEvents.size,
            cueEventsCount: this.cueEvents.size
        };
    }

    /**
     * デバッグ情報表示
     */
    debug(): void {
        const status = this.getStatus();
        console.log('🎼 MusicalTimeManager Status:', status);

        console.log('📅 Scheduled Events:');
        for (const [id, event] of this.scheduledEvents) {
            console.log(`  - ${id}: ${event.action} at`, event.time);
        }

        console.log('🎯 Cue Events:');
        for (const [id, cue] of this.cueEvents) {
            console.log(`  - ${id}: ${cue.name} (${cue.target})`);
        }
    }

    enableBeatTimingMeasurement(reset: boolean = true) {
        this.beatTimingEnabled = true;
        if (reset) this.beatTimingSamples = [];
        console.log('⏱️ Beat timing measurement enabled');
    }

    disableBeatTimingMeasurement() {
        this.beatTimingEnabled = false;
        console.log('⏱️ Beat timing measurement disabled');
    }

    getBeatTimingStats(): BeatTimingStats | null {
        if (!this.beatTimingSamples.length) return null;
        const arr = this.beatTimingSamples.map(s => s.driftMs);
        const count = arr.length;
        const mean = arr.reduce((a, b) => a + b, 0) / count;
        const max = Math.max(...arr);
        const min = Math.min(...arr);
        const std = Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count);
        return {
            samples: [...this.beatTimingSamples],
            count,
            meanDriftMs: mean,
            maxDriftMs: max,
            minDriftMs: min,
            stdDevMs: std
        };
    }
}

// グローバルインスタンス（既存のaudioCoreとの統合用）
export let musicalTimeManagerInstance: MusicalTimeManager | null = null;

/**
 * MusicalTimeManagerの初期化
 */
export function initMusicalTimeManager(audioContext: AudioContext, initialTempo?: TempoInfo): MusicalTimeManager {
    if (musicalTimeManagerInstance) {
        console.warn('MusicalTimeManager already initialized');
        return musicalTimeManagerInstance;
    }

    musicalTimeManagerInstance = new MusicalTimeManager(audioContext, initialTempo);
    console.log('✅ MusicalTimeManager initialized');

    // グローバル参照設定（デバッグ用）
    (window as any).musicalTimeManager = musicalTimeManagerInstance;

    return musicalTimeManagerInstance;
}

/**
 * MusicalTimeManagerインスタンス取得
 */
export function getMusicalTimeManager(): MusicalTimeManager | null {
    return musicalTimeManagerInstance;
}
