export type SectionATimingDistribution = 'uniform' | 'gaussian' | 'exponential';

export interface SectionATimingParameters {
    minInterval: number;
    maxInterval: number;
    distribution: SectionATimingDistribution;
}

export interface SectionATimingEvolutionStage {
    atSeconds: number;
    minInterval: number;
    maxInterval: number;
    transitionDuration: number;
}

export interface SectionAMetronomeSettings {
    bpm: number;
    timeSignature: {
        numerator: number;
        denominator: number;
    };
    clickSound: 'acoustic' | 'electronic' | 'custom';
    accent: boolean;
    volume: number;
    routeToMonitorsOnly: boolean;
}

export interface SectionAGranularSettings {
    grainSize: number;
    grainDensity: number;
    grainSpray: number;
    pitchVariation: number;
    ampVariation: number;
    pan: number;
    loop: boolean;
    targetDuration: number;
    positionJitter?: number;
}

export interface SectionADecayEnvelope {
    decayTime: number;
    decayCurve: number;
}

export interface SectionADecayEvolution {
    start: SectionADecayEnvelope;
    end: SectionADecayEnvelope;
    interpolation: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface SectionAMimicryTrigger {
    minRecordings: number;
    allPerformersPlayed: boolean;
}

export interface SectionAMimicrySettings {
    evaluationStartSeconds: number;
    evaluationIntervalSeconds: number;
    maxSimultaneousVoices: number;
    recentRecordingWindowSeconds: number;
}

// テストモード切り替え用
export type SustainTestMode = 'granular-only' | 'reverb-plus-granular';

export interface SectionANotificationScoreData {
    clef: 'treble' | 'bass';
    notes: string;
    articulations: string[];
    dynamics: string[];
    instructionText?: string;
    techniqueText?: string;
    staveWidth: number;
}

// ============================================
// 🧪 テストモード設定
// ============================================
// この定数を変更してテストモードを切り替えてください：
//
// 'granular-only': 
//   - グラニュラーシンセシスのみで15秒引き伸ばし
//   - リバーブはほぼドライ（wet 5%）
//   - グラニュラーの効果を明確に確認できます
//
// 'reverb-plus-granular': 
//   - リバーブ（wet 35%）+ グラニュラー引き伸ばし
//   - 両方の効果を組み合わせた自然な長時間サステイン
//
// ⚠️ 変更後は必ずリロードしてください
// 📖 詳しいテスト手順は GRANULAR_TEST_GUIDE.md を参照
export const SUSTAIN_TEST_MODE: SustainTestMode = 'reverb-plus-granular';

export const sectionASettings = {
    durationSeconds: 60,
    performerIds: ['player1', 'player2', 'player3'] as const,
    initialization: {
        schedulerStartSeconds: 1,
        transitionPhaseStartSeconds: 70
    },
    timing: {
        initial: {
            minInterval: 5000,  // 5秒 (より長い間隔)
            maxInterval: 8000,  // 8秒
            distribution: 'uniform' as SectionATimingDistribution
        },
        evolution: [
            {
                atSeconds: 10,  // 10秒後から少しずつ頻度を上げ始める
                minInterval: 4000,
                maxInterval: 6500,
                transitionDuration: 8
            },
            {
                atSeconds: 36,  // 36秒から穏やかに再開
                minInterval: 3500,
                maxInterval: 5500,
                transitionDuration: 8
            },
            {
                atSeconds: 45,  // 45秒からさらに頻度を上げる
                minInterval: 2500,
                maxInterval: 3500,
                transitionDuration: 7
            },
            {
                atSeconds: 54,  // 54秒からBへの受け渡しに向けて密度を上げる
                minInterval: 1800,
                maxInterval: 2600,
                transitionDuration: 6
            }
        ] as SectionATimingEvolutionStage[]
    },
    reverb: {
        roomSize: 0.85,      // 大きな空間 (引き伸ばし効果)
        damping: 0.3,        // 低ダンピング = 長い残響
        wetLevel: 0.35,      // ウェット成分を増やす
        dryLevel: 0.65,      // ドライ成分
        width: 1.0
    },
    granular: {
        primary: {
            grainSize: 150,          // さらに長いグレイン = よりスムーズ
            grainDensity: 35,        // 密度を大幅に上げて連続性を確保
            grainSpray: 0.1,         // スプレイを最小限に
            pitchVariation: 0,       // ピッチ変動なし
            ampVariation: 0.1,       // 音量変動を最小限に
            pan: 0.5,
            loop: true,
            targetDuration: 15.0,    // 15秒に引き伸ばし
            positionJitter: 0.45     // ソース全体の45%の範囲でランダムにアクセス
        } as SectionAGranularSettings,
        textureAlternative: {
            grainSize: 180,
            grainDensity: 30,
            grainSpray: 0.2,
            pitchVariation: 20,      // 軽いピッチ変動
            ampVariation: 0.2,
            pan: 0.5,
            loop: true,
            targetDuration: 15.0,
            positionJitter: 0.75     // より広範囲に散らす
        } as SectionAGranularSettings
    },
    decayEvolution: {
        start: { decayTime: 10.0, decayCurve: 2.0 },
        end: { decayTime: 20.0, decayCurve: 1.5 },
        interpolation: 'linear'
    } as SectionADecayEvolution,
    mimicryTrigger: {
        minRecordings: 3,
        allPerformersPlayed: true
    } as SectionAMimicryTrigger,
    mimicry: {
        evaluationStartSeconds: 42,
        evaluationIntervalSeconds: 8,
        maxSimultaneousVoices: 2,
        recentRecordingWindowSeconds: 20
    } as SectionAMimicrySettings,
    notifications: {
        leadTimeSeconds: 1,
        countdownSeconds: 1,
        scoreData: {
            clef: 'treble',
            notes: 'B4/16',
            articulations: ['staccato'],
            dynamics: ['mf'],
            staveWidth: 320
        } as SectionANotificationScoreData
    },
    metronome: {
        bpm: 60,
        timeSignature: { numerator: 4, denominator: 4 },
        clickSound: 'electronic',
        accent: true,
        volume: 0.35,
        routeToMonitorsOnly: true
    } as SectionAMetronomeSettings,
    fadeout: {
        startSeconds: 58,
        durationMs: 2000
    }
} as const;

// ============================================
// 🧪 テストモード別リバーブ設定を取得
// ============================================
export function getReverbSettingsForTestMode() {
    if (SUSTAIN_TEST_MODE === 'granular-only') {
        // グラニュラー単体テスト: リバーブをドライにしてグラニュラーの効果を明確化
        return {
            roomSize: 0.3,       // 小さな空間
            damping: 0.8,        // 高ダンピング = 短い残響
            wetLevel: 0.05,      // ほぼドライ
            dryLevel: 0.95,
            width: 1.0
        };
    } else {
        // リバーブ+グラニュラー: 両方の効果を組み合わせ
        return {
            roomSize: 0.85,      // 大きな空間
            damping: 0.3,        // 低ダンピング = 長い残響
            wetLevel: 0.35,      // ウェット成分
            dryLevel: 0.65,
            width: 1.0
        };
    }
}

// ============================================
// 🧪 テストモード別説明を取得
// ============================================
export function getTestModeDescription(): string {
    if (SUSTAIN_TEST_MODE === 'granular-only') {
        return '🧪 TEST MODE: グラニュラー単体 (リバーブはほぼドライ、グラニュラーのみで15秒引き伸ばし)';
    } else {
        return '🧪 TEST MODE: リバーブ+グラニュラー (両方の効果を組み合わせて引き伸ばし)';
    }
}

// ============================================================================
// Section B Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionBSettings = {
    durationSeconds: 60,
    // TODO: Define Section B specific parameters
} as const;

// ============================================================================
// Section C Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionCSettings = {
    durationSeconds: 60,
    // TODO: Define Section C specific parameters
} as const;

// ============================================================================
// Section D Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionDSettings = {
    durationSeconds: 60,
    // TODO: Define Section D specific parameters
} as const;

// ============================================================================
// Section E Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionESettings = {
    durationSeconds: 60,
    // TODO: Define Section E specific parameters
} as const;

// ============================================================================
// Section F Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionFSettings = {
    durationSeconds: 60,
    // TODO: Define Section F specific parameters
} as const;

// ============================================================================
// Section G Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionGSettings = {
    durationSeconds: 60,
    // TODO: Define Section G specific parameters
} as const;

// ============================================================================
// Section H Settings (Placeholder - to be implemented)
// ============================================================================
export const sectionHSettings = {
    durationSeconds: 60,
    // TODO: Define Section H specific parameters
} as const;
