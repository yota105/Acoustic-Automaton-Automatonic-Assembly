/**
 * AudioWorklet Processor Base Class
 * High-performance audio processing foundation
 */

/// <reference path="./types.d.ts" />

export abstract class AudioWorkletProcessorBase extends AudioWorkletProcessor {
    protected sampleRate: number;
    protected bufferPool: Map<number, Float32Array[]> = new Map();
    protected messageQueue: Array<{ type: string; data: any }> = [];

    constructor(_options?: AudioWorkletNodeOptions) {
        super();
        this.sampleRate = (globalThis as any).sampleRate || 48000;
        this.setupMessageHandling();
    }

    private setupMessageHandling(): void {
        this.port.onmessage = (event: MessageEvent) => {
            this.handleMessage(event.data);
        };
    }

    protected abstract handleMessage(message: { type: string; data: any }): void;

    protected abstract processAudio(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>
    ): void;

    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>
    ): boolean {
        try {
            this.processAudio(inputs, outputs, parameters);
            this.processMessageQueue();
            return true;
        } catch (error) {
            console.error('[AudioWorkletProcessor] Error in process:', error);
            return false;
        }
    }

    private processMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
                this.port.postMessage(message);
            }
        }
    }

    protected getBuffer(size: number): Float32Array {
        let pool = this.bufferPool.get(size);
        if (!pool) {
            pool = [];
            this.bufferPool.set(size, pool);
        }

        if (pool.length > 0) {
            return pool.pop()!;
        }

        return new Float32Array(size);
    }

    protected releaseBuffer(buffer: Float32Array): void {
        const size = buffer.length;
        let pool = this.bufferPool.get(size);
        if (!pool) {
            pool = [];
            this.bufferPool.set(size, pool);
        }

        // Limit pool size to prevent memory bloat
        if (pool.length < 10) {
            buffer.fill(0); // Clear buffer before returning to pool
            pool.push(buffer);
        }
    }

    protected postMessage(type: string, data: any): void {
        this.messageQueue.push({ type, data });
    }
}

/**
 * Test Signal AudioWorklet Processor
 * High-performance signal generation in AudioWorklet context
 */
interface SignalGenerator {
    type: 'tone' | 'noise' | 'impulse';
    id: string;
    params: {
        frequency?: number;
        amplitude?: number;
        duration?: number;
    };
    startTime: number;
    active: boolean;
    phase?: number; // For oscillators
    noiseBuffer?: Float32Array; // For noise
}

class TestSignalProcessor extends AudioWorkletProcessorBase {
    private generators: Map<string, SignalGenerator> = new Map();
    private globalNoiseBuffer: Float32Array | null = null;
    private noiseBufferIndex = 0;

    constructor(options?: AudioWorkletNodeOptions) {
        super(options);
        this.initializeNoiseBuffer();
    }

    private initializeNoiseBuffer(): void {
        const bufferLength = Math.floor(this.sampleRate * 1.0); // 1 second of noise
        this.globalNoiseBuffer = new Float32Array(bufferLength);

        for (let i = 0; i < bufferLength; i++) {
            this.globalNoiseBuffer[i] = (Math.random() * 2 - 1) * 0.25;
        }

        this.postMessage('noiseBufferReady', { size: bufferLength });
    }

    protected handleMessage(message: { type: string; data: any }): void {
        switch (message.type) {
            case 'startSignal':
                this.startSignal(message.data);
                break;
            case 'stopSignal':
                this.stopSignal(message.data.id);
                break;
            case 'stopAll':
                this.stopAllSignals();
                break;
            case 'updateParams':
                this.updateParams(message.data);
                break;
        }
    }

    private startSignal(data: {
        type: 'tone' | 'noise' | 'impulse';
        id: string;
        params: any;
    }): void {
        // Stop existing signal with same ID
        this.stopSignal(data.id);

        const generator: SignalGenerator = {
            type: data.type,
            id: data.id,
            params: data.params,
            startTime: (globalThis as any).currentTime || 0,
            active: true,
            phase: 0
        };

        this.generators.set(data.id, generator);
        this.postMessage('signalStarted', { id: data.id, type: data.type });

        // Auto-stop after duration
        const duration = data.params.duration || this.getDefaultDuration(data.type);
        setTimeout(() => {
            this.stopSignal(data.id);
        }, duration * 1000);
    }

    private stopSignal(id: string): void {
        const generator = this.generators.get(id);
        if (generator) {
            generator.active = false;
            this.generators.delete(id);
            this.postMessage('signalStopped', { id });
        }
    }

    private stopAllSignals(): void {
        for (const id of this.generators.keys()) {
            this.stopSignal(id);
        }
    }

    private updateParams(data: { id: string; params: any }): void {
        const generator = this.generators.get(data.id);
        if (generator) {
            Object.assign(generator.params, data.params);
        }
    }

    private getDefaultDuration(type: 'tone' | 'noise' | 'impulse'): number {
        switch (type) {
            case 'tone':
            case 'noise':
                return 0.6;
            case 'impulse':
                return 0.1;
            default:
                return 0.6;
        }
    }

    protected processAudio(
        _inputs: Float32Array[][],
        outputs: Float32Array[][],
        _parameters: Record<string, Float32Array>
    ): void {
        const output = outputs[0];
        if (!output || output.length === 0) return;

        const frameCount = output[0].length;
        const outputChannel = output[0];

        // Clear output
        outputChannel.fill(0);

        // Process all active generators
        for (const generator of this.generators.values()) {
            if (!generator.active) continue;

            const elapsed = ((globalThis as any).currentTime || 0) - generator.startTime;
            const duration = generator.params.duration || this.getDefaultDuration(generator.type);

            if (elapsed >= duration) {
                generator.active = false;
                continue;
            }

            this.generateSignal(generator, outputChannel, frameCount, elapsed, duration);
        }
    }

    private generateSignal(
        generator: SignalGenerator,
        output: Float32Array,
        frameCount: number,
        elapsed: number,
        duration: number
    ): void {
        const amplitude = generator.params.amplitude || this.getDefaultAmplitude(generator.type);

        switch (generator.type) {
            case 'tone':
                this.generateTone(generator, output, frameCount, amplitude, elapsed, duration);
                break;
            case 'noise':
                this.generateNoise(generator, output, frameCount, amplitude, elapsed, duration);
                break;
            case 'impulse':
                this.generateImpulse(generator, output, frameCount, amplitude, elapsed, duration);
                break;
        }
    }

    private generateTone(
        generator: SignalGenerator,
        output: Float32Array,
        frameCount: number,
        amplitude: number,
        elapsed: number,
        duration: number
    ): void {
        const frequency = generator.params.frequency || 440;
        const phaseIncrement = (2 * Math.PI * frequency) / this.sampleRate;

        for (let i = 0; i < frameCount; i++) {
            // Envelope
            const envelope = this.calculateEnvelope(elapsed + (i / this.sampleRate), duration);

            // Sawtooth wave
            const sample = ((generator.phase || 0) / Math.PI - 1) * amplitude * envelope;
            output[i] += sample;

            generator.phase = ((generator.phase || 0) + phaseIncrement) % (2 * Math.PI);
        }
    }

    private generateNoise(
        _generator: SignalGenerator,
        output: Float32Array,
        frameCount: number,
        amplitude: number,
        elapsed: number,
        duration: number
    ): void {
        if (!this.globalNoiseBuffer) return;

        for (let i = 0; i < frameCount; i++) {
            const envelope = this.calculateEnvelope(elapsed + (i / this.sampleRate), duration);
            const sample = this.globalNoiseBuffer[this.noiseBufferIndex] * amplitude * envelope;
            output[i] += sample;

            this.noiseBufferIndex = (this.noiseBufferIndex + 1) % this.globalNoiseBuffer.length;
        }
    }

    private generateImpulse(
        _generator: SignalGenerator,
        output: Float32Array,
        frameCount: number,
        amplitude: number,
        elapsed: number,
        duration: number
    ): void {
        const attackTime = 0.001; // 1ms attack
        const decayTime = duration - attackTime;

        for (let i = 0; i < frameCount; i++) {
            const t = elapsed + (i / this.sampleRate);
            let envelope = 0;

            if (t < attackTime) {
                envelope = t / attackTime;
            } else if (t < duration) {
                envelope = Math.exp(-5 * (t - attackTime) / decayTime);
            }

            output[i] += amplitude * envelope;
        }
    }

    private calculateEnvelope(t: number, duration: number): number {
        const fadeTime = Math.min(0.01, duration * 0.1); // 10ms or 10% of duration

        if (t < fadeTime) {
            return t / fadeTime;
        } else if (t > duration - fadeTime) {
            return Math.max(0, (duration - t) / fadeTime);
        } else {
            return 1;
        }
    }

    private getDefaultAmplitude(type: 'tone' | 'noise' | 'impulse'): number {
        switch (type) {
            case 'tone':
                return 0.35;
            case 'noise':
                return 0.25;
            case 'impulse':
                return 0.8;
            default:
                return 0.35;
        }
    }
}

// Register the processor
(globalThis as any).registerProcessor('test-signal-processor', TestSignalProcessor);
