/**
 * Composition Timeline - 作品の時間構造定義
 * 
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
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds - 8 } },
                    action: "display_score",
                    parameters: {
                        target: 'next',
                        scoreData: {
                            player1: {
                                clef: 'treble',
                                notes: 'B4/8, B4/8, B4/8, B4/8',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H音スタッカート継続。偶発的に±25centを差し込む心構え。',
                                staveWidth: 220
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/8, B4/8, B4/8, B4/8',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'パルスを保ちつつ、後半に向けて密度を減衰させる準備。',
                                staveWidth: 220
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/8, (B3+50)/8, (B3-50)/8, B3/8',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H3を基点とし上下1/4音程度の揺れを用意。',
                                staveWidth: 240
                            }
                        },
                        performanceInstructions: {
                            articulation: 'Light staccato with shared pulse',
                            dynamics: 'mp → p (pulse抜きへ)',
                            interpretationText: '粒子が増えるにつれて応答を軽くし、終盤には静止へ向かう。'
                        }
                    },
                    label: "Next: Section B 予告",
                    description: "H音素材での粒度強化と終盤減衰の方針を周知",
                    target: "performers"
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
                                notes: 'B4/8, (B4+20)/8, B4/8, (B4-15)/8',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: '基本はH4スタッカート。粒子の揺れに合わせ±1/8音の上下を呼吸で追従。',
                                staveWidth: 240
                            },
                            player2: {
                                clef: 'treble',
                                notes: 'B4/8, B4/8, (B4+10)/8, (B4-10)/8',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H4パルスを維持しつつ、粒子拡散に伴い密度を段階的に低減。',
                                staveWidth: 240
                            },
                            player3: {
                                clef: 'bass',
                                notes: 'B3/8, (B3-35)/8, (B3+35)/8, B3/8',
                                articulations: ['staccato'],
                                dynamics: ['mp'],
                                instructionText: 'H3を中心に上下3半音まで徐々に解放。重心は常にHへ回帰。',
                                staveWidth: 260
                            }
                        },
                        performanceInstructions: {
                            articulation: 'Particle-synced staccato with gradual detune window',
                            dynamics: 'mp → pp (pulse消失)',
                            interpretationText: '終盤でパルスを止め、残された引き伸ばし音と電子粒子の揺らぎを聴き取る。'
                        }
                    },
                    label: "Now: Section B 指示",
                    description: "H音中心のスタッカートと可変レンジを提示",
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
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds } },
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
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 3 } },
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
                    id: "section_b_player2_long_sustain",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 12 } },
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
                    id: "section_b_player1_long_sustain",
                    type: "cue",
                    at: { type: 'absolute', time: { seconds: sectionASettings.durationSeconds + 26 } },
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
