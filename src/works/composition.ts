/**
 * Composition Timeline - 作品の時間構造定義
 * 
 * 音楽的時間（拍子・小節）とプログラム的時間（秒数）を統合管理
 * 全セクション、イベント、キューを一元的に記述
 */

import { sectionASettings } from "./acoustic-automaton/sectionAConfig";

// ========== 奏者の定義 ==========

/**
 * 演奏者の定義
 */
export interface Performer {
    id: string;                  // 奏者ID（例: "player1", "vocalist"）
    name: string;                // 表示名（例: "演奏者A", "ボーカリスト"）
    role?: string;               // 役割（例: "主奏者", "即興演奏者"）
    instrument?: string;         // 楽器（例: "saxophone", "percussion"）
    color?: string;              // UI表示用の色
    displayOrder?: number;       // 表示順序
}

/**
 * 指示の対象者
 */
export type TargetAudience =
    | 'all'                      // 全員（オペレーター + 全演奏者）
    | 'operator'                 // オペレーターのみ
    | 'performers'               // 全演奏者
    | { performers: string[] }   // 特定の演奏者リスト（IDで指定）
    | { exclude: string[] };     // 特定の演奏者を除外

// ========== 時間表現の型定義 ==========

/**
 * 音楽的時間: 小節・拍・細分化で指定
 */
export interface MusicalTime {
    bar: number;           // 小節番号（1始まり）
    beat: number;          // 拍番号（1始まり）
    subdivision?: number;  // 細分化（オプション、0なら無視）
}

/**
 * 絶対時間: 秒数で指定
 */
export interface AbsoluteTime {
    seconds: number;
}

/**
 * 時間指定: 音楽的時間または絶対時間
 */
export type TimePoint =
    | { type: 'musical'; time: MusicalTime }
    | { type: 'absolute'; time: AbsoluteTime }
    | { type: 'cue'; cueId: string };  // 他のイベント完了を待つ

// ========== テンポ・拍子の定義 ==========

export interface TempoMarking {
    bpm: number;
    numerator: number;      // 拍子の分子（例: 4/4なら4）
    denominator: number;    // 拍子の分母（例: 4/4なら4）
    at: TimePoint;          // テンポ変更タイミング
    description?: string;   // 説明（例: "Allegro"）
}

// ========== イベントの定義 ==========

export type EventType =
    | 'audio'           // 音響イベント（再生・停止など）
    | 'visual'          // 視覚イベント（表示変更など）
    | 'cue'             // パフォーマーへのキュー
    | 'tempo_change'    // テンポ変更
    | 'system'          // システム制御
    | 'notation';       // 楽譜表示

export interface CompositionEvent {
    id: string;              // イベント固有ID
    type: EventType;
    at: TimePoint;           // 発火タイミング
    duration?: TimePoint;    // 持続時間（オプション）

    // イベント内容
    action: string;          // アクション名（例: "play_track", "show_notation"）
    parameters?: Record<string, any>;  // アクションのパラメータ

    // メタ情報
    label?: string;          // 表示名
    description?: string;    // 説明
    color?: string;          // UIでの色分け
    target?: TargetAudience | string;  // 対象者（後方互換のためstringも許可）
}

// ========== セクション構造 ==========

export interface Section {
    id: string;
    name: string;
    description?: string;

    // セクションの時間範囲
    start: TimePoint;
    end?: TimePoint;  // 省略時は次のセクション開始まで

    // セクション内のテンポ
    tempo?: TempoMarking;

    // セクション内のイベント
    events: CompositionEvent[];

    // 演奏指示
    performanceNotes?: string[];
}

// ========== 作品全体の構造 ==========

export interface Composition {
    // メタデータ
    title: string;
    composer: string;
    duration: AbsoluteTime;  // 想定演奏時間
    created: string;
    version: string;

    // 演奏者情報
    performers?: Performer[];  // 演奏者リスト

    // 初期設定
    initialTempo: TempoMarking;

    // 作品構造
    sections: Section[];

    // グローバルイベント（セクションに属さない）
    globalEvents?: CompositionEvent[];

    // パフォーマンス設定
    performanceSettings?: {
        metronomeEnabled: boolean;
        clickTrackVolume: number;
        autoScrollNotation: boolean;
        [key: string]: any;
    };
}

// ========== 作品定義: "Acoustic Automaton / Automatonic Assembly" ==========

export const composition: Composition = {
    // メタデータ
    title: "Acoustic Automaton / Automatonic Assembly",
    composer: "Yota Nakamura",
    duration: { seconds: 720 },  // 想定12分
    created: "2025-10-11",
    version: "1.0.0",

    // 演奏者定義
    performers: [
        {
            id: "player1",
            name: "Horn1",
            role: "Horn",
            instrument: "Horn1",
            color: "#4CAF50",
            displayOrder: 1
        },
        {
            id: "player2",
            name: "Horn2",
            role: "Horn",
            instrument: "Horn2",
            color: "#2196F3",
            displayOrder: 2
        },
        {
            id: "player3",
            name: "Trombone",
            role: "Trombone",
            instrument: "Trombone",
            color: "#FF9800",
            displayOrder: 3
        }
    ],

    // 初期テンポ
    initialTempo: {
        bpm: 60,
        numerator: 4,
        denominator: 4,
        at: { type: 'musical', time: { bar: 1, beat: 1 } },
        description: "None"
    },

    // セクション構造
    sections: [
        // ========== Section A: Introduction (60秒) ==========
        {
            id: "section_a_intro",
            name: "A: Introduction",
            description: "導入部 / H4スタッカートと電子音響学習フェーズ",

            start: { type: 'absolute', time: { seconds: 0 } },
            end: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },

            tempo: {
                bpm: sectionASettings.metronome.bpm,
                numerator: sectionASettings.metronome.timeSignature.numerator,
                denominator: sectionASettings.metronome.timeSignature.denominator,
                at: { type: 'musical', time: { bar: 1, beat: 1 } },
                description: "静的パルス"
            },

            events: [
                {
                    id: "section_a_init",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: 0 } },
                    action: "initialize_section_a",
                    parameters: {
                        timingParams: sectionASettings.timing.initial,
                        reverbSettings: sectionASettings.reverb,
                        granularSettings: sectionASettings.granular.primary,
                        granularTextureSettings: sectionASettings.granular.textureAlternative,
                        decayEvolution: sectionASettings.decayEvolution,
                        mimicryTrigger: sectionASettings.mimicryTrigger
                    },
                    label: "Section A 初期化",
                    description: "ランダム演奏スケジューラーとFaust処理チェーンを準備",
                    target: "operator"
                },
                {
                    id: "section_a_metronome_start",
                    type: "audio",
                    at: { type: 'absolute', time: { seconds: 0 } },
                    action: "start_metronome",
                    parameters: {
                        bpm: sectionASettings.metronome.bpm,
                        timeSignature: sectionASettings.metronome.timeSignature,
                        clickSound: sectionASettings.metronome.clickSound,
                        accent: sectionASettings.metronome.accent,
                        volume: sectionASettings.metronome.volume,
                        routeToMonitorsOnly: sectionASettings.metronome.routeToMonitorsOnly
                    },
                    label: "メトロノーム開始",
                    description: "奏者モニター専用に60BPMのクリックを送出",
                    target: "all"
                },
                {
                    id: "section_a_prepare_notifications",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: 3 } },
                    action: "prime_now_next_notifications",
                    parameters: {
                        scoreData: sectionASettings.notifications.scoreData,
                        leadTimeSeconds: sectionASettings.notifications.leadTimeSeconds,
                        countdownSeconds: sectionASettings.notifications.countdownSeconds
                    },
                    label: "Now/Next準備",
                    description: "演奏者UIのNow/Nextキューを事前ロード",
                    target: "operator"
                },
                {
                    id: "section_a_performance_start",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.initialization.schedulerStartSeconds } },
                    action: "start_random_performance_scheduler",
                    parameters: {
                        performers: [...sectionASettings.performerIds],
                        scoreData: sectionASettings.notifications.scoreData,
                        initialTiming: sectionASettings.timing.initial,
                        notificationLeadTime: sectionASettings.notifications.leadTimeSeconds
                    },
                    label: "ランダム演奏開始",
                    description: "各奏者へランダム間隔でH4スタッカートを指示",
                    target: "operator"
                },
                ...sectionASettings.timing.evolution.map((stage, index) => ({
                    id: `section_a_timing_evolution_${index + 1}`,
                    type: "system" as const,
                    at: { type: 'absolute' as const, time: { seconds: stage.atSeconds } },
                    action: "update_timing_parameters",
                    parameters: {
                        minInterval: stage.minInterval,
                        maxInterval: stage.maxInterval,
                        transitionDuration: stage.transitionDuration
                    },
                    label: "タイミング進化",
                    description: `${stage.transitionDuration}秒で演奏間隔を更新`,
                    target: "operator"
                } as CompositionEvent)),
                {
                    id: "section_a_enable_mimicry",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.mimicry.evaluationStartSeconds } },
                    action: "enable_section_a_mimicry",
                    parameters: {
                        trigger: sectionASettings.mimicryTrigger,
                        evaluationIntervalSeconds: sectionASettings.mimicry.evaluationIntervalSeconds,
                        maxSimultaneousVoices: sectionASettings.mimicry.maxSimultaneousVoices
                    },
                    label: "模倣モード開始",
                    description: "録音データ解析後に電子奏者を有効化",
                    target: "operator"
                },
                {
                    id: "section_a_performance_end",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.initialization.transitionPhaseStartSeconds } },
                    action: "stop_random_performance_scheduler",
                    label: "ランダム演奏終了",
                    description: "次セクションへの移行準備",
                    target: "operator"
                },
                {
                    id: "section_a_fadeout",
                    type: "audio",
                    at: { type: 'absolute', time: { seconds: sectionASettings.fadeout.startSeconds } },
                    action: "fadeout_reverb_tails",
                    parameters: { duration: sectionASettings.fadeout.durationMs },
                    label: "リバーブテールフェードアウト",
                    description: "残響とグラニュラー持続音を2秒で減衰",
                    target: "operator"
                }
            ],

            performanceNotes: [
                "0-5秒: メトロノームと電子処理チェーンを静かに立ち上げる",
                "5-55秒: 奏者はランダム指示に従いH4スタッカートを演奏、電子音響が録音と模倣を学習",
                "55秒以降: ランダム指示を停止し、グラニュラー持続音と模倣音をフェードアウト"
            ]
        },

        // ==================== Section B ====================
        {
            id: "section_b",
            name: "B",
            description: "演奏者のエントリー。音響的オートマトンとの対話が始まる。",

            start: { type: 'musical', time: { bar: 17, beat: 1 } },
            end: { type: 'musical', time: { bar: 49, beat: 1 } },

            tempo: {
                bpm: 108,
                numerator: 4,
                denominator: 4,
                at: { type: 'musical', time: { bar: 17, beat: 1 } },
                description: "Poco meno mosso"
            },

            events: [
                // 演奏者A（サックス）のエントリー
                {
                    id: "dev_player1_entry",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 17, beat: 1 } },
                    action: "performer_entry",
                    parameters: {
                        instruction: "長音（ロングトーン）から始める",
                        dynamics: "p"
                    },
                    label: "演奏者A エントリー",
                    target: { performers: ["player1"] },
                    color: "#4CAF50"
                },
                // 演奏者B（パーカッション）のエントリー
                {
                    id: "dev_player2_entry",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 17, beat: 1 } },
                    action: "performer_entry",
                    parameters: {
                        instruction: "静かなパルスから始める",
                        dynamics: "pp"
                    },
                    label: "演奏者B エントリー",
                    target: { performers: ["player2"] },
                    color: "#2196F3"
                },
                // オペレーター指示
                {
                    id: "dev_track_1_start",
                    type: "audio",
                    at: { type: 'musical', time: { bar: 17, beat: 1 } },
                    action: "start_track",
                    parameters: { trackId: "track_1", fadeIn: 2000 },
                    label: "トラック1開始",
                    target: "operator"
                },
                // 演奏者A専用の強度指示
                {
                    id: "dev_player1_crescendo",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 21, beat: 1 } },
                    action: "dynamic_change",
                    parameters: {
                        instruction: "徐々にクレッシェンド",
                        targetDynamics: "mf",
                        bars: 4
                    },
                    label: "演奏者A クレッシェンド",
                    target: { performers: ["player1"] },
                    color: "#4CAF50"
                },
                // 和声変化（全員に通知）
                {
                    id: "dev_harmony_change_1",
                    type: "system",
                    at: { type: 'musical', time: { bar: 25, beat: 1 } },
                    action: "update_harmony",
                    parameters: { key: "D", mode: "dorian" },
                    label: "和声変化: D Dorian",
                    target: "all"
                },
                // 演奏者B専用のリズム変更指示
                {
                    id: "dev_player2_rhythm_change",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 29, beat: 1 } },
                    action: "rhythm_change",
                    parameters: {
                        instruction: "不規則なパルスへ移行",
                        pattern: "irregular"
                    },
                    label: "演奏者B リズム変更",
                    target: { performers: ["player2"] },
                    color: "#2196F3"
                },
                // 演奏者C（エレクトロニクス）のエントリー
                {
                    id: "dev_player3_entry",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 33, beat: 1 } },
                    action: "performer_entry",
                    parameters: {
                        instruction: "アンビエントテクスチャ追加",
                        effect: "granular"
                    },
                    label: "演奏者C エントリー",
                    target: { performers: ["player3"] },
                    color: "#FF9800"
                },
                // テンポ変更（全員に通知）
                {
                    id: "dev_tempo_accel",
                    type: "tempo_change",
                    at: { type: 'musical', time: { bar: 33, beat: 1 } },
                    action: "tempo_change",
                    parameters: {
                        targetBpm: 132,
                        transitionDuration: { bar: 4, beat: 1 }
                    },
                    label: "テンポ加速開始",
                    description: "4小節かけて108→132 BPMへ"
                },
                {
                    id: "dev_intensity_peak",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 41, beat: 1 } },
                    action: "intensity_cue",
                    parameters: {
                        message: "fff - 最大音量へ",
                        intensity: 1.0
                    },
                    label: "強度ピーク",
                    target: "all",
                    color: "#F44336"
                }
            ],

            performanceNotes: [
                "演奏者は自由な即興を展開",
                "33小節目からテンポが徐々に加速",
                "41小節目でクライマックスに到達"
            ]
        }
    ],

    // パフォーマンス設定
    performanceSettings: {
        metronomeEnabled: true,
        clickTrackVolume: 0.3,
        autoScrollNotation: true,
        visualSyncEnabled: true,
        recordPerformance: false
    }
};

// ========== ユーティリティ関数 ==========

/**
 * 指定された時刻のテンポを取得
 */
export function getTempoAt(comp: Composition, bar: number): TempoMarking {
    let currentTempo = comp.initialTempo;

    for (const section of comp.sections) {
        if (section.tempo && section.start.type === 'musical') {
            const sectionBar = section.start.time.bar;
            if (bar >= sectionBar) {
                currentTempo = section.tempo;
            }
        }
    }

    return currentTempo;
}

/**
 * 指定された時刻のセクションを取得
 */
export function getSectionAt(comp: Composition, bar: number): Section | null {
    for (const section of comp.sections) {
        if (section.start.type === 'musical') {
            const startBar = section.start.time.bar;
            const endBar = section.end?.type === 'musical' ? section.end.time.bar : Infinity;

            if (bar >= startBar && bar < endBar) {
                return section;
            }
        }
    }

    return null;
}

/**
 * 指定された時刻までのイベントを取得
 */
export function getEventsUpTo(comp: Composition, bar: number, beat: number): CompositionEvent[] {
    const events: CompositionEvent[] = [];

    for (const section of comp.sections) {
        for (const event of section.events) {
            if (event.at.type === 'musical') {
                const eventBar = event.at.time.bar;
                const eventBeat = event.at.time.beat;

                if (eventBar < bar || (eventBar === bar && eventBeat <= beat)) {
                    events.push(event);
                }
            }
        }
    }

    return events;
}

/**
 * 作品の総小節数を計算
 */
export function getTotalBars(comp: Composition): number {
    let maxBar = 0;

    for (const section of comp.sections) {
        if (section.end?.type === 'musical') {
            maxBar = Math.max(maxBar, section.end.time.bar);
        }
    }

    return maxBar;
}

/**
 * 特定の奏者向けのイベントのみを取得
 * @param comp 作品データ
 * @param performerId 奏者ID（"player1", "player2"など）
 * @returns その奏者向けのイベントリスト
 */
export function getEventsForPerformer(comp: Composition, performerId: string): CompositionEvent[] {
    const events: CompositionEvent[] = [];

    for (const section of comp.sections) {
        for (const event of section.events) {
            if (isEventForPerformer(event, performerId)) {
                events.push(event);
            }
        }
    }

    // グローバルイベントもチェック
    if (comp.globalEvents) {
        for (const event of comp.globalEvents) {
            if (isEventForPerformer(event, performerId)) {
                events.push(event);
            }
        }
    }

    return events;
}

/**
 * イベントが特定の奏者向けかどうかを判定
 * @param event イベント
 * @param performerId 奏者ID
 * @returns true: 該当奏者向け、false: 対象外
 */
export function isEventForPerformer(event: CompositionEvent, performerId: string): boolean {
    const target = event.target;

    // targetが未指定 or 'all' → 全員対象
    if (!target || target === 'all') {
        return true;
    }

    // 'performers' → 全演奏者対象
    if (target === 'performers') {
        return true;
    }

    // 'operator' → 演奏者は対象外
    if (target === 'operator') {
        return false;
    }

    // 文字列で直接指定されている場合
    if (typeof target === 'string') {
        return target === performerId;
    }

    // オブジェクト形式での指定
    if (typeof target === 'object') {
        // 特定の演奏者リスト
        if ('performers' in target && Array.isArray(target.performers)) {
            return target.performers.includes(performerId);
        }

        // 除外リスト
        if ('exclude' in target && Array.isArray(target.exclude)) {
            return !target.exclude.includes(performerId);
        }
    }

    return false;
}

/**
 * オペレーター向けのイベントのみを取得
 * @param comp 作品データ
 * @returns オペレーター向けのイベントリスト
 */
export function getEventsForOperator(comp: Composition): CompositionEvent[] {
    const events: CompositionEvent[] = [];

    for (const section of comp.sections) {
        for (const event of section.events) {
            const target = event.target;
            if (!target || target === 'all' || target === 'operator') {
                events.push(event);
            }
        }
    }

    // グローバルイベントもチェック
    if (comp.globalEvents) {
        for (const event of comp.globalEvents) {
            const target = event.target;
            if (!target || target === 'all' || target === 'operator') {
                events.push(event);
            }
        }
    }

    return events;
}

/**
 * 指定された時刻に発火する、特定の奏者向けイベントを取得
 * @param comp 作品データ
 * @param performerId 奏者ID
 * @param bar 小節番号
 * @param beat 拍番号
 * @returns 該当するイベントリスト
 */
export function getEventsForPerformerAt(
    comp: Composition,
    performerId: string,
    bar: number,
    beat: number
): CompositionEvent[] {
    const events: CompositionEvent[] = [];

    for (const section of comp.sections) {
        for (const event of section.events) {
            if (event.at.type === 'musical') {
                const eventBar = event.at.time.bar;
                const eventBeat = event.at.time.beat;

                if (eventBar === bar && eventBeat === beat) {
                    if (isEventForPerformer(event, performerId)) {
                        events.push(event);
                    }
                }
            }
        }
    }

    return events;
}

export default composition;
