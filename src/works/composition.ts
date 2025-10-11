/**
 * Composition Timeline - 作品の時間構造定義
 * 
 * 音楽的時間（拍子・小節）とプログラム的時間（秒数）を統合管理
 * 全セクション、イベント、キューを一元的に記述
 */

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
            name: "演奏者A",
            role: "主奏者",
            instrument: "saxophone",
            color: "#4CAF50",
            displayOrder: 1
        },
        {
            id: "player2",
            name: "演奏者B",
            role: "即興演奏者",
            instrument: "percussion",
            color: "#2196F3",
            displayOrder: 2
        },
        {
            id: "player3",
            name: "演奏者C",
            role: "補助奏者",
            instrument: "electronics",
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
        description: "Moderato"
    },

    // セクション構造
    sections: [
        // ========== Section A: Introduction (1分間) ==========
        {
            id: "section_a_intro",
            name: "A: Introduction",
            description: "導入部 / Hを中心としたパルス",

            start: { type: 'absolute', time: { seconds: 0 } },
            end: { type: 'absolute', time: { seconds: 60 } },

            events: [
                {
                    id: "intro_metronome_start",
                    type: "audio",
                    at: { type: 'musical', time: { bar: 1, beat: 1 } },
                    action: "start_metronome",
                    parameters: { volume: 0.3 },
                    label: "メトロノーム開始",
                    description: "静かにメトロノームが鳴り始める",
                    target: "all"
                },
                {
                    id: "intro_notation_display",
                    type: "notation",
                    at: { type: 'musical', time: { bar: 1, beat: 1 } },
                    action: "show_score",
                    parameters: { section: "intro", page: 1 },
                    label: "楽譜表示",
                    target: "performers"  // 全演奏者に表示
                },
                {
                    id: "intro_visual_fade_in",
                    type: "visual",
                    at: { type: 'musical', time: { bar: 1, beat: 1 } },
                    duration: { type: 'musical', time: { bar: 4, beat: 1 } },
                    action: "fade_in",
                    parameters: { duration: 4000 },
                    label: "ビジュアルフェードイン",
                    target: "operator"  // オペレーターのみに通知
                },
                {
                    id: "intro_cue_player1_ready",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 10, beat: 1 } },
                    action: "show_cue",
                    parameters: {
                        message: "準備: 7小節後エントリー",
                        priority: "high"
                    },
                    label: "演奏者A準備キュー",
                    target: { performers: ["player1"] },  // 演奏者Aのみ
                    color: "#4CAF50"
                },
                {
                    id: "intro_cue_player2_ready",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 13, beat: 1 } },
                    action: "show_cue",
                    parameters: {
                        message: "準備: 4小節後エントリー",
                        priority: "medium"
                    },
                    label: "演奏者B準備キュー",
                    target: { performers: ["player2"] },  // 演奏者Bのみ
                    color: "#2196F3"
                }
            ],

            performanceNotes: [
                "メトロノーム音量は段階的に調整可能",
                "演奏者は16小節目までに演奏準備を完了"
            ]
        },

        // ========== Section B: Development (小節 17-48) ==========
        {
            id: "section_b_development",
            name: "B: Development",
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
        },

        // ========== Section C: Transformation (小節 49-80) ==========
        {
            id: "section_c_transformation",
            name: "C: Transformation",
            description: "変容。リズムと和声の変化。",

            start: { type: 'musical', time: { bar: 49, beat: 1 } },
            end: { type: 'musical', time: { bar: 81, beat: 1 } },

            tempo: {
                bpm: 96,
                numerator: 7,
                denominator: 8,
                at: { type: 'musical', time: { bar: 49, beat: 1 } },
                description: "7/8 - Asymmetric"
            },

            events: [
                {
                    id: "trans_meter_change",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 49, beat: 1 } },
                    action: "meter_change",
                    parameters: {
                        message: "拍子変更: 7/8",
                        pattern: "3+2+2"
                    },
                    label: "拍子変更",
                    target: "all",
                    color: "#9C27B0"
                },
                {
                    id: "trans_dsp_effect_1",
                    type: "audio",
                    at: { type: 'musical', time: { bar: 53, beat: 1 } },
                    action: "enable_effect",
                    parameters: {
                        effectId: "granular_delay",
                        wet: 0.4
                    },
                    label: "グラニュラーディレイON"
                },
                {
                    id: "trans_notation_page_2",
                    type: "notation",
                    at: { type: 'musical', time: { bar: 57, beat: 1 } },
                    action: "show_score",
                    parameters: { section: "transformation", page: 2 },
                    label: "楽譜ページ2",
                    target: "performer"
                },
                {
                    id: "trans_visual_morph",
                    type: "visual",
                    at: { type: 'musical', time: { bar: 65, beat: 1 } },
                    duration: { type: 'musical', time: { bar: 8, beat: 1 } },
                    action: "morph_pattern",
                    parameters: {
                        from: "circular",
                        to: "fractal",
                        duration: 8000
                    },
                    label: "ビジュアル変形"
                }
            ],

            performanceNotes: [
                "7/8拍子（3+2+2のグルーピング）",
                "グラニュラー・プロセッシング適用",
                "視覚要素も連動して変容"
            ]
        },

        // ========== Section D: Coda (小節 81-96) ==========
        {
            id: "section_d_coda",
            name: "D: Coda",
            description: "結尾。静寂への回帰。",

            start: { type: 'musical', time: { bar: 81, beat: 1 } },
            end: { type: 'musical', time: { bar: 97, beat: 1 } },

            tempo: {
                bpm: 60,
                numerator: 4,
                denominator: 4,
                at: { type: 'musical', time: { bar: 81, beat: 1 } },
                description: "Lento - molto ritardando"
            },

            events: [
                {
                    id: "coda_fadeout_start",
                    type: "audio",
                    at: { type: 'musical', time: { bar: 81, beat: 1 } },
                    duration: { type: 'musical', time: { bar: 12, beat: 1 } },
                    action: "fade_out_all",
                    parameters: { duration: 12000 },
                    label: "全体フェードアウト開始"
                },
                {
                    id: "coda_performer_end",
                    type: "cue",
                    at: { type: 'musical', time: { bar: 89, beat: 1 } },
                    action: "performer_fadeout",
                    parameters: {
                        message: "8小節かけてフェードアウト",
                        duration: { bar: 8, beat: 1 }
                    },
                    label: "演奏者フェードアウト",
                    target: "performer",
                    color: "#607D8B"
                },
                {
                    id: "coda_metronome_stop",
                    type: "audio",
                    at: { type: 'musical', time: { bar: 93, beat: 1 } },
                    action: "stop_metronome",
                    parameters: { fadeOut: 4000 },
                    label: "メトロノーム停止"
                },
                {
                    id: "coda_visual_fade_out",
                    type: "visual",
                    at: { type: 'musical', time: { bar: 93, beat: 1 } },
                    duration: { type: 'musical', time: { bar: 4, beat: 1 } },
                    action: "fade_out",
                    parameters: { duration: 4000 },
                    label: "ビジュアルフェードアウト"
                },
                {
                    id: "coda_end",
                    type: "system",
                    at: { type: 'musical', time: { bar: 97, beat: 1 } },
                    action: "composition_end",
                    parameters: { autoStop: true },
                    label: "作品終了",
                    description: "自動停止"
                }
            ],

            performanceNotes: [
                "全体が徐々に静寂へ回帰",
                "メトロノームは最後まで時を刻み続け、93小節目で停止",
                "97小節目で完全終了"
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
