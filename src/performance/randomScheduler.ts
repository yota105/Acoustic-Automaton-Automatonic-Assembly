import type { PerformanceMessenger } from '../messaging/performanceMessenger';
import { getGlobalMicInputGateManager } from '../engine/audio/devices/micInputGate';

type Distribution = 'uniform' | 'gaussian' | 'exponential';

export interface TimingParameters {
    minInterval: number;
    maxInterval: number;
    distribution?: Distribution;
}

export interface PerformerTarget {
    performerId: string;
    playerNumber: string;
    label?: string;
}

interface ScheduledEventState {
    performer: PerformerTarget;
    countdownSeconds: number;
    countdownSent: boolean;
}

export interface RandomPerformanceSchedulerOptions {
    messenger: PerformanceMessenger;
    performers: PerformerTarget[];
    timing: TimingParameters;
    leadTimeSeconds: number;
    countdownSeconds: number;
    sectionId?: string | null;
    sectionName?: string | null;
    scoreData?: any;
}

/**
 * RandomPerformanceScheduler
 * --------------------------
 * Section A 用のランダム演奏指示スケジューラー。
 * 与えられたタイミング範囲で奏者を選び、指定のリードタイムに従って
 * カウントダウンと演奏開始メッセージを送信する。
 */
export class RandomPerformanceScheduler {
    private readonly messenger: PerformanceMessenger;
    private performers: PerformerTarget[];
    private timing: TimingParameters;
    private leadTimeSeconds: number;
    private countdownSeconds: number;
    private sectionId: string | null;
    private sectionName: string | null;
    private scoreData: any;

    private running = false;
    private activeTimeouts = new Set<number>();
    private scheduledEvent: ScheduledEventState | null = null;
    private lastPerformerId: string | null = null;

    constructor(options: RandomPerformanceSchedulerOptions) {
        this.messenger = options.messenger;
        this.performers = [...options.performers];
        this.timing = { ...options.timing };
        this.leadTimeSeconds = Math.max(0, options.leadTimeSeconds);
        this.countdownSeconds = Math.max(0, options.countdownSeconds);
        this.sectionId = options.sectionId ?? null;
        this.sectionName = options.sectionName ?? null;
        this.scoreData = options.scoreData;
    }

    start() {
        if (this.running) {
            console.warn('[RandomPerformanceScheduler] start() called while running');
            return;
        }

        if (!this.performers.length) {
            console.warn('[RandomPerformanceScheduler] No performers available; scheduler will not start');
            return;
        }

        this.running = true;
        console.log('[RandomPerformanceScheduler] Started with', {
            performers: this.performers.map(p => p.performerId),
            timing: this.timing,
            leadTimeSeconds: this.leadTimeSeconds,
            countdownSeconds: this.countdownSeconds,
            sectionId: this.sectionId,
        });
        this.scheduleNextEvent();
    }

    stop(reason: string = 'scheduler stopped') {
        if (!this.running) {
            return;
        }

        this.running = false;
        this.activeTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.clear();

        if (this.scheduledEvent?.countdownSent) {
            this.sendCountdownCancelled(this.scheduledEvent.performer, reason);
        }

        this.scheduledEvent = null;
        console.log('[RandomPerformanceScheduler] Stopped:', reason);
    }

    updateTiming(next: TimingParameters) {
        this.timing = { ...next };
        console.log('[RandomPerformanceScheduler] Timing updated:', this.timing);
    }

    getTiming(): TimingParameters {
        return { ...this.timing };
    }

    updateSection(sectionId: string | null, sectionName?: string | null) {
        this.sectionId = sectionId;
        this.sectionName = sectionName ?? null;
    }

    updateScoreData(scoreData: any) {
        this.scoreData = scoreData;
    }

    updatePerformers(targets: PerformerTarget[]) {
        this.performers = [...targets];
    }

    private scheduleNextEvent() {
        if (!this.running) {
            return;
        }

        if (!this.performers.length) {
            console.warn('[RandomPerformanceScheduler] No performers available when scheduling next event');
            return;
        }

        const performer = this.choosePerformer();
        const intervalMs = this.computeIntervalMs();

        const effectiveCountdownSeconds = Math.min(
            this.countdownSeconds,
            this.leadTimeSeconds,
            intervalMs / 1000,
        );

        const countdownDelayMs = Math.max(0, intervalMs - effectiveCountdownSeconds * 1000);

        this.scheduledEvent = {
            performer,
            countdownSeconds: effectiveCountdownSeconds,
            countdownSent: false,
        };

        if (effectiveCountdownSeconds > 0) {
            const countdownTimeout = window.setTimeout(() => {
                this.activeTimeouts.delete(countdownTimeout);
                this.handleCountdown(performer, effectiveCountdownSeconds);
            }, countdownDelayMs);
            this.activeTimeouts.add(countdownTimeout);
        }

        const performTimeout = window.setTimeout(() => {
            this.activeTimeouts.delete(performTimeout);
            this.handlePerform(performer);
        }, intervalMs);
        this.activeTimeouts.add(performTimeout);

        console.log('[RandomPerformanceScheduler] Scheduled performer', performer.performerId, 'in', intervalMs, 'ms', {
            countdownSeconds: effectiveCountdownSeconds,
            section: this.sectionId,
        });
    }

    private handleCountdown(performer: PerformerTarget, seconds: number) {
        if (!this.running) {
            return;
        }

        this.scheduledEvent = this.scheduledEvent
            ? { ...this.scheduledEvent, countdownSent: true }
            : { performer, countdownSeconds: seconds, countdownSent: true };

        this.sendCountdown(performer, seconds);
    }

    private handlePerform(performer: PerformerTarget) {
        if (!this.running) {
            return;
        }

        this.sendCountdown(performer, 0);
        this.scheduledEvent = null;
        this.scheduleNextEvent();
    }

    private sendCountdown(target: PerformerTarget, secondsRemaining: number) {
        const sectionLabel = this.sectionName ?? this.sectionId ?? '';
        const performerLabel = target.label ?? `Player ${target.playerNumber}`;

        const formattedSeconds = secondsRemaining >= 1
            ? secondsRemaining.toFixed(0)
            : secondsRemaining.toFixed(1);

        const message = secondsRemaining > 0
            ? `${performerLabel}: ${formattedSeconds}s`
            : `${performerLabel}: Play now!`;

        // カウントダウン開始時にマイク入力ゲートを開く
        if (secondsRemaining > 0 && secondsRemaining >= this.countdownSeconds) {
            const gateManager = getGlobalMicInputGateManager();
            gateManager.openGateForPerformance(
                target.performerId,
                this.countdownSeconds,  // カウントダウン時間でフェードイン
                1.0,                    // 1秒間全開
                0.8                     // 0.8秒でフェードアウト
            );
            console.log(`[RandomScheduler] Opening mic gate for ${target.performerId}`);
        }

        this.messenger.send({
            type: 'countdown',
            target: target.playerNumber,
            data: {
                secondsRemaining,
                message,
                sectionId: this.sectionId,
                sectionName: sectionLabel,
                performerId: target.performerId,
                scoreData: this.scoreData,
            },
        });
    }

    private sendCountdownCancelled(target: PerformerTarget, reason: string) {
        this.messenger.send({
            type: 'countdown-cancelled',
            target: target.playerNumber,
            data: {
                message: reason,
                sectionId: this.sectionId,
                performerId: target.performerId,
            },
        });
    }

    private choosePerformer(): PerformerTarget {
        if (this.performers.length === 1) {
            return this.performers[0];
        }

        let candidate: PerformerTarget;
        let safety = 0;

        do {
            const index = Math.floor(Math.random() * this.performers.length);
            candidate = this.performers[index];
            safety += 1;
        } while (candidate.performerId === this.lastPerformerId && safety < 5);

        this.lastPerformerId = candidate.performerId;
        return candidate;
    }

    private computeIntervalMs(): number {
        const min = Math.max(250, Number.isFinite(this.timing.minInterval) ? this.timing.minInterval : 1000);
        const max = Math.max(min, Number.isFinite(this.timing.maxInterval) ? this.timing.maxInterval : min);

        if (this.timing.distribution && this.timing.distribution !== 'uniform') {
            console.warn('[RandomPerformanceScheduler] Unsupported distribution provided; falling back to uniform:', this.timing.distribution);
        }

        const span = max - min;
        const random = Math.random();
        return min + span * random;
    }
}
