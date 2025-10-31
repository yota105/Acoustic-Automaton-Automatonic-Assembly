/**
 * Composition Timeline - 作品の時間構造定義
 * 音楽的時間（拍子・小節）とプログラム的時間（秒数）を統合管理
 * 全セクション、イベント、キューを一元的に記述
 */

import { sectionASettings } from "./acoustic-automaton/sectionsConfig";

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

const SECTION_B_STAGE2_TREBLE_POOL = ['Bb4', 'B4', 'C5'] as const;
const SECTION_B_STAGE2_BASS_POOL = ['Bb3', 'B3', 'C4'] as const;
const SECTION_B_STAGE3_TREBLE_POOL = ['Bb4', 'B4', 'C5', 'C#5'] as const;
const SECTION_B_STAGE3_BASS_POOL = ['Bb3', 'B3', 'C4', 'C#4'] as const;
const FINAL_STAGE_TREBLE_POOL = ['Ab4', 'A4', 'Bb4', 'B4', 'C5', 'C#5', 'D5'] as const;
const FINAL_STAGE_BASS_POOL = ['Ab3', 'A3', 'Bb3', 'B3', 'C4', 'C#4', 'D4'] as const;

const pickRandomFrom = <T>(pool: readonly T[]): T => pool[Math.floor(Math.random() * pool.length)];

const sectionBStage2Assigned = {
    player1: pickRandomFrom(SECTION_B_STAGE2_TREBLE_POOL),
    player2: pickRandomFrom(SECTION_B_STAGE2_TREBLE_POOL),
    player3: pickRandomFrom(SECTION_B_STAGE2_BASS_POOL)
} as const;

const sectionBStage3Assigned = {
    player1: pickRandomFrom(SECTION_B_STAGE3_TREBLE_POOL),
    player3: pickRandomFrom(SECTION_B_STAGE3_BASS_POOL)
} as const;

const finalStageAssignedTrebleNote = pickRandomFrom(FINAL_STAGE_TREBLE_POOL);
const finalStageAssignedBassNote = pickRandomFrom(FINAL_STAGE_BASS_POOL);

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
                // ========== 演奏者画面の初期表示 ==========
                {
                    id: "section_a_player_current_notation",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: 0 } },
                    action: "display_score",
                    parameters: {
                        target: 'current',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'none',
                                staveWidth: 150
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'none',
                                staveWidth: 150
                            },
                            player3: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'none',
                                staveWidth: 150
                            }
                        },
                        performanceInstructions: {
                            articulation: 'staccato',
                            dynamics: 'mp',
                            interpretationText: 'none'
                        }
                    },
                    label: "Now: H音スタッカート表示",
                    description: "全奏者のCurrent画面にH音スタッカート楽譜を表示",
                    target: "performers"
                },
                {
                    id: "section_a_player_next_notation",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: 0 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'none',
                                staveWidth: 150
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'none',
                                staveWidth: 150
                            },
                            player3: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'none',
                                staveWidth: 150
                            }
                        },
                        performanceInstructions: {
                            articulation: 'staccato',
                            dynamics: 'mp',
                            interpretationText: 'none'
                        }
                    },
                    label: "Next: H音スタッカート表示",
                    description: "全奏者のNext画面にも同じH音スタッカート楽譜を表示",
                    target: "performers"
                },

                // ========== システム初期化 ==========
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
                        mimicryTrigger: sectionASettings.mimicryTrigger,
                        toneCue: {
                            frequencyHz: 493.883, // H4 (B4)
                            durationSeconds: 1.2,
                            fadeInSeconds: 0.05,
                            holdSeconds: 0.3,
                            fadeOutSeconds: 0.5,
                            waveform: 'sine',
                            level: 0.22
                        }
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
            description: "引き伸ばし音を維持しながら粒度を増やし、演奏者がH音素材で対話するセクション。",

            start: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },
            end: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 40 } },

            tempo: {
                bpm: 108,
                numerator: 4,
                denominator: 4,
                at: { type: 'musical', time: { bar: 17, beat: 1 } },
                description: "Poco meno mosso"
            },

            events: [
                {
                    id: "section_b_player_next_notation",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds - 6 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H4スタッカートで基点を確認する。',
                                staveWidth: 220
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H4スタッカートで共有パルスの起点を揃える。',
                                staveWidth: 220
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H3スタッカートで低域の支えを準備する。',
                                staveWidth: 230
                            }
                        },
                        performanceInstructions: {
                            articulation: '個別スタッカート準備',
                            dynamics: 'mp基準',
                            interpretationText: '次の指示前に各自の基点音を確認する。'
                        }
                    },
                    label: "Next: Section B 予告",
                    description: "四分音符スタッカートに備えて音高幅を徐々に広げる方針を提示",
                    target: "performers"
                },
                {
                    id: "section_b_prime_entry_notifications",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds - 2 } },
                    action: "prime_now_next_notifications",
                    parameters: {
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H4スタッカートで基点を確認する。',
                                staveWidth: 220
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H4スタッカートで共有パルスの起点を揃える。',
                                staveWidth: 220
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/q',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H3スタッカートで低域の支えを準備する。',
                                staveWidth: 230
                            }
                        },
                        leadTimeSeconds: 1,
                        countdownSeconds: 1
                    },
                    label: "Section B カウントダウン準備",
                    description: "Section B 開始直前にカウントダウンとパルスを準備",
                    target: "operator"
                },
                {
                    id: "section_b_player_current_notation",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },
                    action: "display_score",
                    parameters: {
                        target: 'current',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${sectionBStage2Assigned.player1}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb4〜C5帯からプログラムが抽選した単音で粒子の揺れに追従する。',
                                staveWidth: 260
                            },
                            player2: {
                                clef: 'treble',
                                notes: `${sectionBStage2Assigned.player2}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb4〜C5帯で抽選された単音を共有パルスへ乗せる。',
                                staveWidth: 260
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${sectionBStage2Assigned.player3}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb3〜C4帯から抽選された低音で輪郭を固定する。',
                                staveWidth: 260
                            }
                        },
                        performanceInstructions: {
                            articulation: '表示譜面どおりのスタッカート',
                            dynamics: 'mp基準',
                            interpretationText: '表示された抽選単音を即応でスタッカートし揺らぎを受け取る。'
                        }
                    },
                    label: "Now: Section B 指示",
                    description: "四分音符スタッカートで可変レンジを提示",
                    target: "performers"
                },
                {
                    id: "section_b_granular_continuation",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },
                    action: "sustain_granular_layer",
                    parameters: {
                        inheritSection: 'section_a_intro',
                        keepFadeOut: false,
                        maxLifetimeSeconds: 40,
                        crossfadeToElectronicIfExpired: true
                    },
                    label: "引き伸ばし音継続",
                    description: "Section A の引き伸ばし素材をフェードさせず継続",
                    target: "operator"
                },
                {
                    id: "section_b_particle_density_boost",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 2 } },
                    action: "increase_particle_density",
                    parameters: {
                        densityMultiplier: 1.5,
                        electronicPulseGain: 0.85
                    },
                    label: "粒子密度ブースト",
                    description: "パーティクル数と電子パルスを増強",
                    target: "operator"
                },
                {
                    id: "section_b_particle_modulation_start",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 4 } },
                    action: "apply_particle_pitch_modulation",
                    parameters: {
                        detuneRangeCents: 30,
                        modulationPeriodSeconds: 6,
                        coordinateMapping: 'xyz',
                        followPerformerCount: 3
                    },
                    label: "粒子-座標ピッチ連動",
                    description: "パーティクル座標に応じて引き伸ばし音を上下",
                    target: "operator"
                },
                {
                    id: "section_b_player1_entry",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 1.6 } },
                    action: "performer_entry",
                    parameters: {
                        instruction: "H4スタッカートを継続し粒子の揺れに合わせる",
                        dynamics: "mp"
                    },
                    label: "演奏者A エントリー",
                    target: { performers: ["player1"] },
                    color: "#4CAF50"
                },
                {
                    id: "section_b_player2_entry",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },
                    action: "performer_entry",
                    parameters: {
                        instruction: "H4パルスを保ちつつ終盤に向け減衰",
                        dynamics: "mp"
                    },
                    label: "演奏者B エントリー",
                    target: { performers: ["player2"] },
                    color: "#2196F3"
                },
                {
                    id: "section_b_player3_entry",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 3.2 } },
                    action: "performer_entry",
                    parameters: {
                        instruction: "H3で下支えしつつ徐々に±3半音まで解放",
                        dynamics: "mp"
                    },
                    label: "トロンボーン・レンジ拡張開始",
                    target: { performers: ["player3"] },
                    color: "#FF9800"
                },
                {
                    id: "section_b_player_next_sustain_preview",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 6 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${sectionBStage3Assigned.player1}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb4〜C#5帯からプログラムが抽選した単音でHorn2の保持を支える準備。',
                                staveWidth: 300
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/w',
                                dynamics: ['p'],
                                instructionText: 'H4を全音符で保持して次のパルスまで伸ばす。',
                                staveWidth: 220
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${sectionBStage3Assigned.player3}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb3〜C#4帯から抽選された低音で揺らぎを整える。',
                                staveWidth: 300
                            }
                        },
                        performanceInstructions: {
                            articulation: 'スタッカートとサステインの準備',
                            dynamics: '表示譜面に従う',
                            interpretationText: '表示された抽選単音でHorn2のロングトーンに寄り添う準備を整える。'
                        }
                    },
                    label: "Next: Horn2 サステイン予告",
                    description: "Horn2が全音符保持へ入る直前の指示を提示",
                    target: "performers"
                },
                {
                    id: "section_b_prime_player2_sustain",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 10 } },
                    action: "prime_now_next_notifications",
                    parameters: {
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${sectionBStage3Assigned.player1}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb4〜C#5帯から抽選された単音でHorn2の保持を支える準備。',
                                staveWidth: 300
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/w',
                                dynamics: ['p'],
                                instructionText: 'H4を全音符で保持して次のパルスまで伸ばす。',
                                staveWidth: 220
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${sectionBStage3Assigned.player3}/q`,
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'Bb3〜C#4帯から抽選された低音で揺らぎを整える。',
                                staveWidth: 300
                            }
                        },
                        leadTimeSeconds: 1,
                        countdownSeconds: 1
                    },
                    label: "Horn2 サステイン カウントダウン準備",
                    description: "Horn2 のサステイン開始へ向けたカウントダウンを準備",
                    target: "operator"
                },
                {
                    id: "section_b_player_current_player2_sustain",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 12 } },
                    action: "display_score",
                    parameters: {
                        target: 'current',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${sectionBStage3Assigned.player1}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Bb4〜C#5帯から抽選された単音でHorn2の保持を支える。',
                                staveWidth: 300
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/w',
                                dynamics: ['p'],
                                instructionText: 'H4を全音符で伸ばし続ける。',
                                staveWidth: 220
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${sectionBStage3Assigned.player3}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Bb3〜C#4帯から抽選された低音で低域を軽く保つ。',
                                staveWidth: 300
                            }
                        },
                        performanceInstructions: {
                            articulation: '表示譜面どおりのサステイン/スタッカート',
                            dynamics: 'p基調',
                            interpretationText: '表示された抽選単音でHorn2のロングトーンを中心に役割を保つ。'
                        }
                    },
                    label: "Now: Horn2 サステイン実行",
                    description: "Horn2が全音符で保持し、他パートは薄いスタッカートを継続",
                    target: "performers"
                },
                {
                    id: "section_b_player2_long_sustain",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 13.6 } },
                    action: "sustain_note",
                    parameters: {
                        instruction: "単独でHを8秒保持し、電子揺らぎと同調",
                        durationSeconds: 8,
                        dynamics: "p"
                    },
                    label: "Horn2 ロングトーン挿入",
                    target: { performers: ["player2"] },
                    color: "#2196F3"
                },
                {
                    id: "section_b_player_next_player2_rest",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 18 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${finalStageAssignedTrebleNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Ab〜Dの範囲からプログラムが抽選した単音を即応でスタッカートする。',
                                staveWidth: 320
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${finalStageAssignedBassNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Ab〜Dの範囲で自動抽選された低音を柔らかく刻みHorn2の静寂を包む。',
                                staveWidth: 320
                            }
                        },
                        performanceInstructions: {
                            articulation: '休符とスタッカートの切り替え準備',
                            dynamics: '表示譜面に従う',
                            interpretationText: 'プログラムが抽選して表示する単音に即座に反応し、選択は行わない。'
                        }
                    },
                    label: "Next: Horn2 休止予告",
                    description: "Horn2がロングトーン終了後に全休符へ移行する予告表示",
                    target: "performers"
                },
                {
                    id: "section_b_prime_player2_rest",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 19.8 } },
                    action: "prime_now_next_notifications",
                    parameters: {
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${finalStageAssignedTrebleNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Ab〜D帯域から抽選された単音を短く響かせ静寂の輪郭を準備する。',
                                staveWidth: 320
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${finalStageAssignedBassNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Ab〜D帯の抽選音で静寂の体積を支える。',
                                staveWidth: 320
                            }
                        },
                        leadTimeSeconds: 1,
                        countdownSeconds: 1
                    },
                    label: "Horn2 休止 カウントダウン準備",
                    description: "Horn2 が静止に入るタイミングをカウントダウン",
                    target: "operator"
                },
                {
                    id: "section_b_particle_range_expand",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 16 } },
                    action: "expand_particle_pitch_range",
                    parameters: {
                        detuneRangeCents: 80,
                        noiseBlend: 0.25,
                        lifetimeSeconds: 18
                    },
                    label: "粒子の揺れ拡大",
                    description: "揺れ幅を拡張しノイズ成分を加算",
                    target: "operator"
                },
                {
                    id: "section_b_player_current_player2_rest",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 21.6 } },
                    action: "display_score",
                    parameters: {
                        target: 'current',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: `${finalStageAssignedTrebleNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Ab〜Dの抽選単音をそのまま短く鳴らし電子揺らぎを聴く。',
                                staveWidth: 320
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として沈黙を保つ。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${finalStageAssignedBassNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['p'],
                                instructionText: 'Ab〜D帯で抽選された音を最小限のアタックで支える。',
                                staveWidth: 320
                            }
                        },
                        performanceInstructions: {
                            articulation: '表示譜面どおりの休符/スタッカート',
                            dynamics: 'p基調',
                            interpretationText: 'プログラムがAb〜Dから抽選する単音を即応で鳴らし静寂の輪郭を保つ。'
                        }
                    },
                    label: "Now: Horn2 休止",
                    description: "Horn2が全休符へ移行し、他パートは高低を広げたスタッカートで薄く支える",
                    target: "performers"
                },
                {
                    id: "section_b_player_next_player1_sustain",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 24 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/w',
                                dynamics: ['pp'],
                                instructionText: 'H4を全音符で伸ばし次のパルスを待つ。',
                                staveWidth: 220
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${finalStageAssignedBassNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['pp'],
                                instructionText: 'Ab〜D帯から抽選された単音を極小のスタッカートで残す。',
                                staveWidth: 320
                            }
                        },
                        performanceInstructions: {
                            articulation: 'サステインとスタッカートの切り替え準備',
                            dynamics: '表示譜面に従う',
                            interpretationText: '抽選された単音が表示されるので響きのバランスだけを整えて備える。'
                        }
                    },
                    label: "Next: Horn1 サステイン予告",
                    description: "Horn1の全音符保持と周囲の静寂バランスを予告",
                    target: "performers"
                },
                {
                    id: "section_b_prime_player1_sustain",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 25.6 } },
                    action: "prime_now_next_notifications",
                    parameters: {
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/w',
                                dynamics: ['pp'],
                                instructionText: 'H4を全音符で伸ばし次のパルスを待つ。',
                                staveWidth: 220
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${finalStageAssignedBassNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['pp'],
                                instructionText: 'Ab〜D帯から抽選された単音を極小アタックで維持する準備。',
                                staveWidth: 320
                            }
                        },
                        leadTimeSeconds: 1,
                        countdownSeconds: 1
                    },
                    label: "Horn1 サステイン カウントダウン準備",
                    description: "Horn1 のロングトーン開始に向けたカウントダウンを用意",
                    target: "operator"
                },
                {
                    id: "section_b_player_current_player1_sustain",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 27.4 } },
                    action: "display_score",
                    parameters: {
                        target: 'current',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/w',
                                dynamics: ['pp'],
                                instructionText: 'H4を全音符で伸ばし粒子と干渉音を聴き切る。',
                                staveWidth: 220
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として完全な静止を保つ。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: `${finalStageAssignedBassNote}/q`,
                                articulations: ['staccato'],
                                dynamics: ['pp'],
                                instructionText: 'Ab〜D帯の抽選単音を最小限のスタッカートで残す。',
                                staveWidth: 320
                            }
                        },
                        performanceInstructions: {
                            articulation: '表示譜面どおりのサステイン/スタッカート',
                            dynamics: 'pp',
                            interpretationText: '抽選された単音が提示されるのでそのまま鳴らしてHの長音とのバランスを保つ。'
                        }
                    },
                    label: "Now: Horn1 サステイン実行",
                    description: "Horn1が全音符で保持し、他パートは静寂と微細なスタッカートで支える",
                    target: "performers"
                },
                {
                    id: "section_b_player1_long_sustain",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 29 } },
                    action: "sustain_note",
                    parameters: {
                        instruction: "Hを9秒保持し粒子と干渉音を聴く",
                        durationSeconds: 9,
                        dynamics: "pp"
                    },
                    label: "Horn1 ロングトーン挿入",
                    target: { performers: ["player1"] },
                    color: "#4CAF50"
                },
                {
                    id: "section_b_player_next_final_rest",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 31 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/wr',
                                dynamics: ['pp'],
                                instructionText: 'H3を全休符として静止する。',
                                staveWidth: 210
                            }
                        },
                        performanceInstructions: {
                            articulation: '休符移行の準備',
                            dynamics: 'pp->silence',
                            interpretationText: '完全な静止に入るタイミングをそれぞれ確認する。'
                        }
                    },
                    label: "Next: 全休符への移行予告",
                    description: "静止して電子テクスチャのみを残す段階を予告",
                    target: "performers"
                },
                {
                    id: "section_b_prime_final_rest",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 32.8 } },
                    action: "prime_now_next_notifications",
                    parameters: {
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/wr',
                                dynamics: ['pp'],
                                instructionText: 'H3を全休符として静止する。',
                                staveWidth: 210
                            }
                        },
                        leadTimeSeconds: 1,
                        countdownSeconds: 1
                    },
                    label: "全休符移行 カウントダウン準備",
                    description: "完全休止へ入る直前のカウントダウンをセット",
                    target: "operator"
                },
                {
                    id: "section_b_particle_density_peak",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 28 } },
                    action: "increase_particle_density",
                    parameters: {
                        densityMultiplier: 2.1,
                        electronicPulseGain: 0.6
                    },
                    label: "粒子密度ピーク",
                    description: "広帯域化に向け粒子数を最大化",
                    target: "operator"
                },
                {
                    id: "section_b_pulse_attenuation",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 30 } },
                    action: "attenuate_electronic_pulses",
                    parameters: {
                        targetGain: 0.2,
                        rampSeconds: 6
                    },
                    label: "電子パルス減衰",
                    description: "画面のフリッカー防止のためパルスを弱める",
                    target: "operator"
                },
                {
                    id: "section_b_pulse_stop",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 30 } },
                    action: "schedule_pulse_silence",
                    parameters: {
                        silenceAtSeconds: sectionASettings.durationSeconds + 30,
                        fadeOutSeconds: 3
                    },
                    label: "パルス停止スケジュール",
                    description: "残り10秒ではパルスを完全停止",
                    target: "operator"
                },
                {
                    id: "section_b_noise_transition",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 33 } },
                    action: "blend_to_noise_texture",
                    parameters: {
                        noiseColor: 'white',
                        blendAmount: 0.5,
                        rampSeconds: 5
                    },
                    label: "ノイズテクスチャ移行",
                    description: "引き伸ばし音がホワイトノイズに接近",
                    target: "operator"
                },
                {
                    id: "section_b_granular_lifetime_refresh",
                    type: "system",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 34 } },
                    action: "refresh_granular_instances",
                    parameters: {
                        replaceExpiredWithElectronic: true,
                        electronicTexture: 'hollow_resynthesis'
                    },
                    label: "粒子寿命管理",
                    description: "寿命超過の粒子を軽量な電子音へ置換",
                    target: "operator"
                },
                {
                    id: "section_b_player_current_final_rest",
                    type: "notation",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 35 } },
                    action: "display_score",
                    parameters: {
                        target: 'current',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/wr',
                                dynamics: ['pp'],
                                instructionText: 'H4を全休符として静止する。',
                                staveWidth: 210
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/wr',
                                dynamics: ['pp'],
                                instructionText: 'H3を全休符として静止する。',
                                staveWidth: 210
                            }
                        },
                        performanceInstructions: {
                            articulation: '表示譜面どおりの休符保持',
                            dynamics: 'pp->silence',
                            interpretationText: '電子残響だけを聴きながら次の指示を待つ。'
                        }
                    },
                    label: "Now: 全休符",
                    description: "各パートが全休符となり、電子音のみが残る状態を表示",
                    target: "performers"
                }
            ],

            performanceNotes: [
                "引き伸ばし音はSection Aから継続。フェードせず粒度を増やす。",
                "全奏者はHを基軸としたスタッカートを維持し、Horn陣は微細な音程揺らぎを共有する。",
                "トロンボーンはH3を中心に終盤までに±3半音の範囲へ徐々に広げる。",
                "個別のロングトーンを挿入し電子粒子との干渉を強調する。",
                "電子パルスは時間経過で弱め、残り10秒には完全停止してホワイトノイズ混合のみを残す。"
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
