/**
 * AudioWorklet Test Signal Processor (Compiled JavaScript)
 * This file is manually compiled from TypeScript for AudioWorklet compatibility
 */

// AudioWorklet Processor Base Class
class AudioWorkletProcessorBase extends AudioWorkletProcessor {
    constructor(_options) {
        super();
        this.sampleRate = globalThis.sampleRate || 48000;
        this.bufferPool = new Map();
        this.messageQueue = [];
        this.setupMessageHandling();
    }

    setupMessageHandling() {
        this.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };
    }

    process(inputs, outputs, parameters) {
        try {
            this.processAudio(inputs, outputs, parameters);
            this.processMessageQueue();
            return true;
        } catch (error) {
            console.error('[AudioWorkletProcessor] Error in process:', error);
            return false;
        }
    }

    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
                this.port.postMessage(message);
            }
        }
    }

    getBuffer(size) {
        let pool = this.bufferPool.get(size);
        if (!pool) {
            pool = [];
            this.bufferPool.set(size, pool);
        }

        if (pool.length > 0) {
            return pool.pop();
        }

        return new Float32Array(size);
    }

    releaseBuffer(buffer) {
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

    postMessage(type, data) {
        this.messageQueue.push({ type, data });
    }
}

// Test Signal AudioWorklet Processor
class TestSignalProcessor extends AudioWorkletProcessorBase {
    constructor(options) {
        super(options);
        this.generators = new Map();
        this.globalNoiseBuffer = null;
        this.noiseBufferIndex = 0;
        this.initializeNoiseBuffer();
    }

    initializeNoiseBuffer() {
        const bufferLength = Math.floor(this.sampleRate * 1.0); // 1 second of noise
        this.globalNoiseBuffer = new Float32Array(bufferLength);

        for (let i = 0; i < bufferLength; i++) {
            this.globalNoiseBuffer[i] = (Math.random() * 2 - 1) * 0.25;
        }

        this.postMessage('noiseBufferReady', { size: bufferLength });
    }

    handleMessage(message) {
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

    startSignal(data) {
        // Stop existing signal with same ID
        this.stopSignal(data.id);

        const generator = {
            type: data.type,
            id: data.id,
            params: data.params,
            startTime: globalThis.currentTime || 0,
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

    stopSignal(id) {
        const generator = this.generators.get(id);
        if (generator) {
            generator.active = false;
            this.generators.delete(id);
            this.postMessage('signalStopped', { id });
        }
    }

    stopAllSignals() {
        for (const id of this.generators.keys()) {
            this.stopSignal(id);
        }
    }

    updateParams(data) {
        const generator = this.generators.get(data.id);
        if (generator) {
            Object.assign(generator.params, data.params);
        }
    }

    getDefaultDuration(type) {
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

    processAudio(_inputs, outputs, _parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return;

        const frameCount = output[0].length;
        const outputChannel = output[0];

        // Clear output
        outputChannel.fill(0);

        // Process all active generators
        for (const generator of this.generators.values()) {
            if (!generator.active) continue;

            const elapsed = (globalThis.currentTime || 0) - generator.startTime;
            const duration = generator.params.duration || this.getDefaultDuration(generator.type);

            if (elapsed >= duration) {
                generator.active = false;
                continue;
            }

            this.generateSignal(generator, outputChannel, frameCount, elapsed, duration);
        }
    }

    generateSignal(generator, output, frameCount, elapsed, duration) {
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

    generateTone(generator, output, frameCount, amplitude, elapsed, duration) {
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

    generateNoise(_generator, output, frameCount, amplitude, elapsed, duration) {
        if (!this.globalNoiseBuffer) return;

        for (let i = 0; i < frameCount; i++) {
            const envelope = this.calculateEnvelope(elapsed + (i / this.sampleRate), duration);
            const sample = this.globalNoiseBuffer[this.noiseBufferIndex] * amplitude * envelope;
            output[i] += sample;

            this.noiseBufferIndex = (this.noiseBufferIndex + 1) % this.globalNoiseBuffer.length;
        }
    }

    generateImpulse(_generator, output, frameCount, amplitude, elapsed, duration) {
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

    calculateEnvelope(t, duration) {
        const fadeTime = Math.min(0.01, duration * 0.1); // 10ms or 10% of duration

        if (t < fadeTime) {
            return t / fadeTime;
        } else if (t > duration - fadeTime) {
            return Math.max(0, (duration - t) / fadeTime);
        } else {
            return 1;
        }
    }

    getDefaultAmplitude(type) {
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
registerProcessor('test-signal-processor', TestSignalProcessor);
