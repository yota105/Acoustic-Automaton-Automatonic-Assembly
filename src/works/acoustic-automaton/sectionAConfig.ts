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
        schedulerStartSeconds: 0,  // 0秒から開始
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
                atSeconds: 25,  // 25秒後から徐々に間隔を詰める
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
        roomSize: 0.9,
        damping: 0.3,
        wetLevel: 0.8,
        dryLevel: 0.2,
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
