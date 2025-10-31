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

export interface SectionANotificationScoreData {
    clef: 'treble' | 'bass';
    notes: string;
    articulations: string[];
    dynamics: string[];
    instructionText?: string;
    techniqueText?: string;
    staveWidth: number;
}

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
                atSeconds: 25,  // 25秒から新規発音停止（残響のみ）
                minInterval: 999999,  // 実質的に発音しない
                maxInterval: 999999,
                transitionDuration: 0
            },
            {
                atSeconds: 30,  // 30秒後から再開・間隔を詰める
                minInterval: 3000,
                maxInterval: 5000,
                transitionDuration: 10
            },
            {
                atSeconds: 45,  // 45秒後からさらに詰める
                minInterval: 1500,
                maxInterval: 2500,
                transitionDuration: 10
            }
        ] as SectionATimingEvolutionStage[]
    },
    reverb: {
        roomSize: 0.55,
        damping: 0.7,
        wetLevel: 0.15,
        dryLevel: 0.85,
        width: 1.0
    },
    granular: {
        primary: {
            grainSize: 80,
            grainDensity: 20,
            grainSpray: 0.3,
            pitchVariation: 0,
            ampVariation: 0.2,
            pan: 0.5,
            loop: true,
            targetDuration: 10.0
        } as SectionAGranularSettings,
        textureAlternative: {
            grainSize: 120,
            grainDensity: 15,
            grainSpray: 0.5,
            pitchVariation: 50,
            ampVariation: 0.4,
            pan: 0.5,
            loop: true,
            targetDuration: 10.0
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
        maxSimultaneousVoices: 2
    },
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
