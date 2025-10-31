import type { PerformanceMessenger } from '../messaging/performanceMessenger';
import { getGlobalMicInputGateManager } from '../engine/audio/devices/micInputGate';

const MIN_EVENT_SPACING_MS = 1500;

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
    scorePayload: any | null;
    targetTimeMs: number;
    countdownTimeoutId?: number;
    performTimeoutId?: number;
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
    perPerformerScoreData?: Record<string, any> | null;
    scoreGenerator?: (performer: PerformerTarget) => any;
    onPerformanceTriggered?: (performerId: string) => void;
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
    private perPerformerScoreData: Record<string, any> | null;
    private scoreGenerator?: (performer: PerformerTarget) => any;
    private onPerformanceTriggered?: (performerId: string) => void;

    private running = false;
    private activeTimeouts = new Set<number>();
    private scheduledEvents = new Map<string, ScheduledEventState>();
    private pauseAfterFirstPerformance = false;  // 初回演奏後に一時停止
    private performedOnceIds = new Set<string>();  // 1回演奏した演奏者のID

    constructor(options: RandomPerformanceSchedulerOptions) {
        this.messenger = options.messenger;
        this.performers = [...options.performers];
        this.timing = { ...options.timing };
        this.leadTimeSeconds = Math.max(0, options.leadTimeSeconds);
        this.countdownSeconds = Math.max(0, options.countdownSeconds);
        this.sectionId = options.sectionId ?? null;
        this.sectionName = options.sectionName ?? null;
        this.scoreData = options.scoreData;
        this.perPerformerScoreData = options.perPerformerScoreData ?? null;
        this.scoreGenerator = options.scoreGenerator;
        this.onPerformanceTriggered = options.onPerformanceTriggered;
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
        
        // 再起動時に古い一時停止状態をクリア
        this.performedOnceIds.clear();
        
        console.log('[RandomPerformanceScheduler] Started with', {
            performers: this.performers.map(p => p.performerId),
            timing: this.timing,
            leadTimeSeconds: this.leadTimeSeconds,
            countdownSeconds: this.countdownSeconds,
            sectionId: this.sectionId,
            pauseAfterFirstPerformance: this.pauseAfterFirstPerformance,
        });
        this.performers.forEach((performer) => {
            this.schedulePerformerEvent(performer, { initial: true });
        });
    }

    stop(reason: string = 'scheduler stopped') {
        if (!this.running) {
            return;
        }

        this.running = false;
        for (const performerId of Array.from(this.scheduledEvents.keys())) {
            this.cancelScheduledEvent(performerId, reason);
        }
        this.activeTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.clear();
        this.scheduledEvents.clear();
        this.performedOnceIds.clear();

        console.log('[RandomPerformanceScheduler] Stopped:', reason);
    }

    updateTiming(next: TimingParameters) {
        this.timing = { ...next };
        console.log('[RandomPerformanceScheduler] Timing updated:', this.timing);
    }

    getTiming(): TimingParameters {
        return { ...this.timing };
    }

    /**
     * 初回演奏後の一時停止モードを設定
     * trueの場合、各演奏者は1回演奏した後、次のスケジュールを行わない
     */
    setPauseAfterFirstPerformance(enabled: boolean) {
        this.pauseAfterFirstPerformance = enabled;
        console.log('[RandomPerformanceScheduler] Pause after first performance:', enabled);
        
        // 無効化された場合、既に1回演奏した演奏者のスケジュールを再開
        if (!enabled && this.performedOnceIds.size > 0) {
            console.log('[RandomPerformanceScheduler] Resuming performers:', Array.from(this.performedOnceIds));
            for (const performerId of this.performedOnceIds) {
                const performer = this.performers.find(p => p.performerId === performerId);
                if (performer && !this.scheduledEvents.has(performerId)) {
                    this.schedulePerformerEvent(performer);
                }
            }
            this.performedOnceIds.clear();
        }
    }

    updateSection(sectionId: string | null, sectionName?: string | null) {
        this.sectionId = sectionId;
        this.sectionName = sectionName ?? null;
    }

    updateScoreData(scoreData: any) {
        this.scoreData = this.cloneScoreData(scoreData);
        this.perPerformerScoreData = null;
        this.scoreGenerator = undefined;

        this.refreshScheduledScorePayloads();
    }

    updatePerPerformerScoreData(next: Record<string, any> | null) {
        this.perPerformerScoreData = next ? this.cloneScoreData(next) : null;
        this.refreshScheduledScorePayloads();
    }

    updatePerformers(targets: PerformerTarget[]) {
        this.performers = [...targets];

        if (!this.running) {
            return;
        }

        const activeIds = new Set(targets.map(p => p.performerId));

        for (const performerId of Array.from(this.scheduledEvents.keys())) {
            if (!activeIds.has(performerId)) {
                this.cancelScheduledEvent(performerId);
            }
        }

        targets.forEach((performer) => {
            const existingState = this.scheduledEvents.get(performer.performerId);
            if (!existingState) {
                this.schedulePerformerEvent(performer, { initial: true });
            } else {
                this.scheduledEvents.set(performer.performerId, {
                    ...existingState,
                    performer,
                });
            }
        });
    }

    private schedulePerformerEvent(performer: PerformerTarget, options: { initial?: boolean } = {}) {
        if (!this.running) {
            return;
        }

        this.cancelScheduledEvent(performer.performerId, undefined);

        const now = this.nowMs();

        // 各演奏者が完全に独立したランダムインターバルを持つ
        const baseIntervalMs = this.computeIntervalMs();
        
        // 初回は大きなオフセットでバラけさせる、通常時はジッターを追加
        let delayMs: number;
        if (options.initial) {
            // 初回: 0からmaxIntervalの範囲でランダムに分散
            delayMs = Math.random() * this.timing.maxInterval;
        } else {
            // 通常: ランダムインターバル + 小さなジッター
            const jitter = (Math.random() - 0.5) * this.timing.maxInterval * 0.2;
            delayMs = Math.max(MIN_EVENT_SPACING_MS, baseIntervalMs + jitter);
        }

        const targetTimeMs = now + delayMs;

        const effectiveCountdownSeconds = Math.min(
            this.countdownSeconds,
            this.leadTimeSeconds,
            delayMs / 1000,
        );

        const countdownDelayMs = Math.max(0, delayMs - effectiveCountdownSeconds * 1000);

        const scorePayload = this.generateScorePayload(performer);

        const state: ScheduledEventState = {
            performer,
            countdownSeconds: effectiveCountdownSeconds,
            countdownSent: false,
            scorePayload,
            targetTimeMs,
        };

        if (effectiveCountdownSeconds > 0) {
            const countdownTimeout = window.setTimeout(() => {
                this.activeTimeouts.delete(countdownTimeout);
                this.handleCountdown(performer.performerId, effectiveCountdownSeconds);
            }, countdownDelayMs);
            state.countdownTimeoutId = countdownTimeout;
            this.activeTimeouts.add(countdownTimeout);
        }

        const performTimeout = window.setTimeout(() => {
            this.activeTimeouts.delete(performTimeout);
            this.handlePerform(performer.performerId);
        }, delayMs);
        state.performTimeoutId = performTimeout;
        this.activeTimeouts.add(performTimeout);

        this.scheduledEvents.set(performer.performerId, state);

        console.log('[RandomPerformanceScheduler] Scheduled performer', performer.performerId, 'in', Math.round(delayMs), 'ms', {
            countdownSeconds: effectiveCountdownSeconds,
            section: this.sectionId,
            baseInterval: Math.round(baseIntervalMs),
            finalDelay: Math.round(delayMs),
            isInitial: options.initial,
        });
    }

    private cancelScheduledEvent(performerId: string, reason?: string) {
        const state = this.scheduledEvents.get(performerId);
        if (!state) {
            return;
        }

        if (state.countdownTimeoutId !== undefined) {
            clearTimeout(state.countdownTimeoutId);
            this.activeTimeouts.delete(state.countdownTimeoutId);
        }

        if (state.performTimeoutId !== undefined) {
            clearTimeout(state.performTimeoutId);
            this.activeTimeouts.delete(state.performTimeoutId);
        }

        if (reason && state.countdownSent) {
            this.sendCountdownCancelled(state.performer, reason);
        }

        this.scheduledEvents.delete(performerId);
    }

    private handleCountdown(performerId: string, seconds: number) {
        if (!this.running) {
            return;
        }

        const state = this.scheduledEvents.get(performerId);
        if (!state) {
            return;
        }

        state.countdownSent = true;
        state.countdownSeconds = seconds;
        state.countdownTimeoutId = undefined;

        this.sendCountdown(state.performer, seconds);
    }

    private handlePerform(performerId: string) {
        if (!this.running) {
            return;
        }

        const state = this.scheduledEvents.get(performerId);
        if (!state) {
            return;
        }

        const performer = state.performer;
        
        // 先に削除
        this.scheduledEvents.delete(performerId);
        
        // コールバックを呼び出す（演奏が実行されたことを通知）
        if (this.onPerformanceTriggered) {
            this.onPerformanceTriggered(performerId);
        }
        
        this.sendCountdown(performer, 0);
        
        // 初回演奏後の一時停止モードの場合、2回目をスケジュールしない
        if (this.pauseAfterFirstPerformance) {
            this.performedOnceIds.add(performerId);
            console.log(`[RandomPerformanceScheduler] ${performerId} performed once, pausing until resumed`);
            return;
        }
        
        this.schedulePerformerEvent(performer);
    }

    private refreshScheduledScorePayloads() {
        if (!this.scheduledEvents.size) {
            return;
        }

        for (const [performerId, state] of this.scheduledEvents.entries()) {
            const updatedPayload = this.generateScorePayload(state.performer);
            this.scheduledEvents.set(performerId, {
                ...state,
                scorePayload: updatedPayload,
            });
        }
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
                2.0,                    // 2秒間全開（演奏時間）
                10.0                    // 10秒でゆっくりフェードアウト（音の引き伸ばし）
            );
            console.log(`[RandomScheduler] Opening mic gate for ${target.performerId} (hold: 2s, fadeout: 10s)`);
        }

        const state = this.scheduledEvents.get(target.performerId);
        const scorePayload = state?.scorePayload ?? this.generateScorePayload(target);

        this.messenger.send({
            type: 'countdown',
            target: target.playerNumber,
            data: {
                secondsRemaining,
                message,
                sectionId: this.sectionId,
                sectionName: sectionLabel,
                performerId: target.performerId,
                scoreData: this.wrapScorePayload(target.performerId, scorePayload),
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

    updateDynamicScoreStrategy(options: {
        sharedScoreData?: any;
        perPerformerScoreData?: Record<string, any> | null;
        scoreGenerator?: (performer: PerformerTarget) => any;
    }) {
        if (options.sharedScoreData !== undefined) {
            this.scoreData = this.cloneScoreData(options.sharedScoreData);
        }

        if (options.perPerformerScoreData !== undefined) {
            this.perPerformerScoreData = options.perPerformerScoreData
                ? this.cloneScoreData(options.perPerformerScoreData)
                : null;
        }

        this.scoreGenerator = options.scoreGenerator;

        this.refreshScheduledScorePayloads();
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

    private generateScorePayload(performer: PerformerTarget) {
        const payload = this.scoreGenerator
            ? this.scoreGenerator(performer)
            : this.perPerformerScoreData?.[performer.performerId]
            ?? this.scoreData;

        return this.cloneScoreData(payload);
    }

    private wrapScorePayload(performerId: string, payload: any) {
        if (!payload) {
            return undefined;
        }

        const cloned = this.cloneScoreData(payload);

        if (this.scoreGenerator || this.perPerformerScoreData) {
            return { [performerId]: cloned };
        }

        return cloned;
    }

    private cloneScoreData(data: any) {
        if (data === undefined || data === null) {
            return null;
        }
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (error) {
            console.warn('[RandomPerformanceScheduler] Failed to clone score data, returning shallow copy');
            return typeof data === 'object' ? { ...data } : data;
        }
    }

    private nowMs(): number {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }
}
