/**
 * AudioWorklet Type Definitions
 * Provides type safety for AudioWorklet development
 */

declare global {
    // AudioWorkletProcessor base class
    abstract class AudioWorkletProcessor {
        readonly port: MessagePort;
        process(
            inputs: Float32Array[][],
            outputs: Float32Array[][],
            parameters: Record<string, Float32Array>
        ): boolean;
    }

    // AudioWorkletGlobalScope
    interface AudioWorkletGlobalScope extends WorkerGlobalScope {
        readonly sampleRate: number;
        readonly currentFrame: number;
        readonly currentTime: number;
        registerProcessor(
            name: string,
            processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
        ): void;
    }

    const sampleRate: number;
    const currentFrame: number;
    const currentTime: number;

    function registerProcessor(
        name: string,
        processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
    ): void;
}

export { };
