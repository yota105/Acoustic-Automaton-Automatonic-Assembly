import { ensureBaseAudio } from '../core/audioCore';
import type { ParticleAudioPoint, ParticleAudioSnapshot } from '../../../visualizers/scenes/particleSystem';

interface ParticleStateMessage {
    type: 'particle-state';
    timestamp: number;
    snapshot: ParticleAudioSnapshot;
}

interface ParticleVoice {
    id: string;
    oscillator: OscillatorNode;
    gainNode: GainNode;
    pannerNode: StereoPannerNode;
    lastUpdated: number;
}

type BroadcastPayload = ParticleStateMessage | null;

const MIN_GAIN = 0.0001;
const MAX_GAIN = 0.14;
const BASE_GAIN = 0.008;
const VOICE_TIMEOUT_MS = 420;
const BASE_PITCH_FREQUENCY = 493.883; // B4
const VERTICAL_RANGE_SEMITONES = 14; // Spread approximately ±7 semitones

export class ParticleAudioSystem {
    private audioCtx: AudioContext | null = null;
    private outputGain: GainNode | null = null;
    private isInitialized = false;
    private readonly voices = new Map<string, ParticleVoice>();
    private readonly channel: BroadcastChannel | null;
    private latestSnapshot: ParticleAudioSnapshot | null = null;
    private isActive = false;

    constructor() {
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.channel = new BroadcastChannel('performance-control');
                this.channel.addEventListener('message', (event) => {
                    this.handleBroadcastMessage(event.data);
                });
            } catch (error) {
                console.error('[ParticleAudioSystem] Failed to open BroadcastChannel', error);
                this.channel = null;
            }
        } else {
            this.channel = null;
        }
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        await ensureBaseAudio();
        const globalAudio = window as any;
        this.audioCtx = globalAudio.audioCtx || globalAudio.audioContext || null;

        if (!this.audioCtx) {
            throw new Error('[ParticleAudioSystem] AudioContext unavailable');
        }

        this.outputGain = this.audioCtx.createGain();
        this.outputGain.gain.value = 0;

        const busManager = globalAudio.busManager;
        const synthBus = busManager?.getSynthInputNode?.();
        const mainBus = busManager?.getEffectsInputNode?.();

        if (synthBus) {
            this.outputGain.connect(synthBus);
        } else if (mainBus) {
            this.outputGain.connect(mainBus);
        } else {
            this.outputGain.connect(this.audioCtx.destination);
        }

        this.isInitialized = true;
        (window as any).particleAudioSystem = this;

        this.setActiveState(this.isActive);

        if (this.latestSnapshot) {
            this.applySnapshot(this.latestSnapshot);
        }
    }

    setSectionContext(sectionId: string | null): void {
        const shouldBeActive = typeof sectionId === 'string' && sectionId.startsWith('section_b');
        this.setActiveState(shouldBeActive);
    }

    setActiveState(active: boolean): void {
        if (this.isActive === active) {
            return;
        }

        this.isActive = active;

        if (!this.audioCtx || !this.outputGain) {
            return;
        }

        const ctxTime = this.audioCtx.currentTime;
        const target = active ? BASE_GAIN : MIN_GAIN;
        this.outputGain.gain.cancelScheduledValues(ctxTime);
        this.outputGain.gain.setTargetAtTime(target, ctxTime, 0.24);

        if (!active) {
            this.voices.forEach((voice) => this.applyVoiceGain(voice, MIN_GAIN));
        }
    }

    dispose(): void {
        this.voices.forEach((voice) => this.shutdownVoice(voice));
        this.voices.clear();
        this.outputGain?.disconnect();
        if (this.channel) {
            try {
                this.channel.close();
            } catch (error) {
                console.error('[ParticleAudioSystem] Failed to close BroadcastChannel', error);
            }
        }
        this.isInitialized = false;
        this.audioCtx = null;
        this.outputGain = null;
    }

    private handleBroadcastMessage(raw: any): void {
        const payload = this.extractParticleState(raw);
        if (!payload) {
            return;
        }

        this.latestSnapshot = payload.snapshot;

        if (!this.isInitialized) {
            return;
        }

        this.applySnapshot(payload.snapshot);
    }

    private extractParticleState(raw: any): BroadcastPayload {
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        if (raw.type === 'particle-state' && raw.snapshot) {
            return raw as ParticleStateMessage;
        }

        if (raw.data && raw.data.type === 'particle-state' && raw.data.snapshot) {
            return {
                type: 'particle-state',
                timestamp: raw.data.timestamp ?? raw.timestamp ?? Date.now(),
                snapshot: raw.data.snapshot,
            };
        }

        return null;
    }

    private applySnapshot(snapshot: ParticleAudioSnapshot): void {
        if (!this.audioCtx || !this.outputGain) {
            return;
        }

        if (!this.isActive) {
            this.fadeOutputToSilence();
            return;
        }

        const nowMs = performance.now();
        const activeVoiceIds = new Set<string>();
        const maxDisplacement = snapshot.totals.maxDisplacement > 0 ? snapshot.totals.maxDisplacement : 1;
        const averageNorm = maxDisplacement > 0 ? snapshot.totals.averageDisplacement / maxDisplacement : 0;
        const ctxTime = this.audioCtx.currentTime;

        const targetOutputGain = BASE_GAIN * 4 + averageNorm * (MAX_GAIN - BASE_GAIN);
        this.outputGain.gain.cancelScheduledValues(ctxTime);
        this.outputGain.gain.setTargetAtTime(targetOutputGain, ctxTime, 0.25);

        snapshot.particles.forEach((particle) => {
            const voice = this.getOrCreateVoice(particle.id);
            activeVoiceIds.add(particle.id);

            const displacementNorm = particle.displacement / maxDisplacement;
            const gainTarget = this.scale(displacementNorm, 0, 1, BASE_GAIN, MAX_GAIN);
            this.applyVoiceGain(voice, gainTarget);

            const panNorm = this.normalizeSymmetric(particle.x, snapshot.bounds.x.min, snapshot.bounds.x.max);
            this.applyVoicePan(voice, panNorm);

            const frequency = this.calculateFrequency(particle, snapshot);
            this.applyVoiceFrequency(voice, frequency);

            voice.lastUpdated = nowMs;
        });

        this.voices.forEach((voice, id) => {
            if (!activeVoiceIds.has(id) && nowMs - voice.lastUpdated > VOICE_TIMEOUT_MS) {
                this.applyVoiceGain(voice, MIN_GAIN);
            }
        });
    }

    private getOrCreateVoice(id: string): ParticleVoice {
        const existing = this.voices.get(id);
        if (existing && existing.oscillator) {
            return existing;
        }

        if (!this.audioCtx || !this.outputGain) {
            throw new Error('[ParticleAudioSystem] Audio context not ready');
        }

        const oscillator = this.audioCtx.createOscillator();
        oscillator.type = 'sawtooth';

        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = MIN_GAIN;

        const pannerNode = this.audioCtx.createStereoPanner();

        oscillator.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(this.outputGain);

        oscillator.start();

        const voice: ParticleVoice = {
            id,
            oscillator,
            gainNode,
            pannerNode,
            lastUpdated: performance.now(),
        };

        this.voices.set(id, voice);
        return voice;
    }

    private applyVoiceGain(voice: ParticleVoice, value: number): void {
        if (!this.audioCtx) {
            return;
        }
        const ctxTime = this.audioCtx.currentTime;
        const target = Math.max(MIN_GAIN, value);
        voice.gainNode.gain.cancelScheduledValues(ctxTime);
        voice.gainNode.gain.setTargetAtTime(target, ctxTime, 0.12);
    }

    private applyVoicePan(voice: ParticleVoice, value: number): void {
        if (!this.audioCtx) {
            return;
        }
        const ctxTime = this.audioCtx.currentTime;
        voice.pannerNode.pan.cancelScheduledValues(ctxTime);
        voice.pannerNode.pan.setTargetAtTime(this.clamp(value, -1, 1), ctxTime, 0.18);
    }

    private applyVoiceFrequency(voice: ParticleVoice, frequency: number): void {
        if (!this.audioCtx) {
            return;
        }
        const ctxTime = this.audioCtx.currentTime;
        voice.oscillator.frequency.cancelScheduledValues(ctxTime);
        voice.oscillator.frequency.setTargetAtTime(this.clamp(frequency, 40, 1600), ctxTime, 0.2);
    }

    private calculateFrequency(particle: ParticleAudioPoint, snapshot: ParticleAudioSnapshot): number {
        const verticalPosition = this.normalizeSymmetric(particle.y, snapshot.bounds.y.min, snapshot.bounds.y.max);
        const depthInfluence = this.normalizeSymmetric(particle.z, snapshot.bounds.z.min, snapshot.bounds.z.max);
        const displacementNorm = snapshot.totals.maxDisplacement > 0
            ? particle.displacement / snapshot.totals.maxDisplacement
            : 0;

        // Primary pitch movement: vertical axis determines semitone offset around B4.
        const verticalSemitoneOffset = verticalPosition * VERTICAL_RANGE_SEMITONES;

        // Subtle modulation: depth and displacement gently perturb the base pitch.
        const depthSemitoneOffset = depthInfluence * 2;
    const displacementSemitoneOffset = displacementNorm * 2;

        const totalSemitoneOffset = verticalSemitoneOffset + depthSemitoneOffset + displacementSemitoneOffset;
        return BASE_PITCH_FREQUENCY * Math.pow(2, totalSemitoneOffset / 12);
    }

    private fadeOutputToSilence(): void {
        if (!this.audioCtx || !this.outputGain) {
            return;
        }
        const ctxTime = this.audioCtx.currentTime;
        this.outputGain.gain.cancelScheduledValues(ctxTime);
        this.outputGain.gain.setTargetAtTime(MIN_GAIN, ctxTime, 0.24);
        this.voices.forEach((voice) => this.applyVoiceGain(voice, MIN_GAIN));
    }

    private shutdownVoice(voice: ParticleVoice): void {
        try {
            voice.oscillator.stop();
        } catch {
            // ignore
        }
        try {
            voice.oscillator.disconnect();
        } catch {
            // ignore
        }
        try {
            voice.gainNode.disconnect();
        } catch {
            // ignore
        }
        try {
            voice.pannerNode.disconnect();
        } catch {
            // ignore
        }
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    private scale(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        if (inMax - inMin === 0) {
            return outMin;
        }
        const normalized = (value - inMin) / (inMax - inMin);
        return outMin + normalized * (outMax - outMin);
    }

    private normalizeSymmetric(value: number, min: number, max: number): number {
        if (max - min === 0) {
            return 0;
        }
        const normalized = (value - min) / (max - min);
        return normalized * 2 - 1;
    }

}

let particleAudioSystem: ParticleAudioSystem | null = null;

export const getParticleAudioSystem = (): ParticleAudioSystem => {
    if (!particleAudioSystem) {
        particleAudioSystem = new ParticleAudioSystem();
    }
    return particleAudioSystem;
};
