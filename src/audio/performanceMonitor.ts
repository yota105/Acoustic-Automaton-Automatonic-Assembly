/**
 * Performance Monitor
 * Measures audio latency, memory usage, and CPU performance
 */

interface LatencyMeasurement {
    timestamp: number;
    roundTripLatency: number;
    audioBufferLatency: number;
    processingLatency: number;
}

interface MemoryMeasurement {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    audioBufferMemory: number;
    workletMemory: number;
}

interface CPUMeasurement {
    timestamp: number;
    mainThreadUsage: number;
    audioThreadUsage: number;
    totalUsage: number;
}

export class PerformanceMonitor {
    private ctx: AudioContext;
    private measurements: {
        latency: LatencyMeasurement[];
        memory: MemoryMeasurement[];
        cpu: CPUMeasurement[];
    } = {
            latency: [],
            memory: [],
            cpu: []
        };

    private isMonitoring = false;
    private monitoringInterval?: number;
    private latencyTestOscillator?: OscillatorNode;
    private latencyTestAnalyser?: AnalyserNode;

    constructor(audioContext: AudioContext) {
        this.ctx = audioContext;
    }

    /**
     * パフォーマンス監視開始
     */
    startMonitoring(intervalMs: number = 1000): void {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        console.log('[PerformanceMonitor] Starting performance monitoring...');

        this.monitoringInterval = window.setInterval(() => {
            this.collectMeasurements();
        }, intervalMs);

        // 初回測定
        this.collectMeasurements();
    }

    /**
     * パフォーマンス監視停止
     */
    stopMonitoring(): void {
        if (!this.isMonitoring) return;

        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }

        this.cleanupLatencyTest();
        console.log('[PerformanceMonitor] Performance monitoring stopped');
    }

    /**
     * 音声レイテンシ測定 (AudioWorklet対応)
     */
    async measureAudioLatency(): Promise<LatencyMeasurement> {
        console.log('[PerformanceMonitor] Measuring audio latency...');

        const startTime = performance.now();

        try {
            // AudioWorkletが利用可能な場合は専用測定を実行
            if (this.isAudioWorkletAvailable()) {
                return await this.measureAudioWorkletLatency(startTime);
            }

            // Fallback: 従来のoscillator測定
            return await this.measureTraditionalLatency(startTime);

        } catch (error) {
            console.error('[PerformanceMonitor] Error measuring latency:', error);

            return {
                timestamp: Date.now(),
                roundTripLatency: -1,
                audioBufferLatency: -1,
                processingLatency: -1
            };
        }
    }

    /**
     * AudioWorklet対応レイテンシ測定 - 精密測定
     */
    private async measureAudioWorkletLatency(startTime: number): Promise<LatencyMeasurement> {
        try {
            // TestSignalManagerV2のAudioWorkletを使用して実測
            const { TestSignalManagerV2 } = await import('./testSignalManagerV2.js');
            const testManager = new TestSignalManagerV2(this.ctx);
            await testManager.initialize();

            // AudioWorkletからのタイミング情報を収集
            let workletTimingData: any = null;
            const timingHandler = (event: CustomEvent) => {
                if (event.detail.logicInputId === 'Performance-Test' &&
                    event.detail.message.type === 'performanceTiming') {
                    workletTimingData = event.detail.message.data;
                }
            };

            window.addEventListener('test-signal-worklet-message', timingHandler as EventListener);

            // 高精度タイムスタンプを使用
            const preciseStart = performance.now();

            // AudioWorklet専用の超短時間テスト信号
            await testManager.start('impulse', 'Performance-Test', {
                frequency: 1000,
                amplitude: 0.0001, // 極小音量
                duration: 0.01 // 10ms - AudioWorkletでの最小実用測定時間
            });

            // AudioWorklet処理の実際の開始待ち（より短い待機時間）
            await new Promise(resolve => setTimeout(resolve, 15));

            const preciseEnd = performance.now();
            testManager.stop('Performance-Test');

            // クリーンアップ
            window.removeEventListener('test-signal-worklet-message', timingHandler as EventListener);

            // 実測レイテンシ（人工的制限なし）
            const actualRoundTripLatency = preciseEnd - preciseStart;

            // AudioContextの実際のレイテンシ計算
            const baseLatency = this.ctx.baseLatency ? this.ctx.baseLatency * 1000 : 0;
            const outputLatency = this.ctx.outputLatency ? this.ctx.outputLatency * 1000 : 0;
            const audioBufferLatency = baseLatency + outputLatency ||
                (128 / this.ctx.sampleRate) * 1000; // Fallback

            // 実際の処理レイテンシ（制限なし）
            const actualProcessingLatency = Math.max(0, actualRoundTripLatency - audioBufferLatency);

            const measurement: LatencyMeasurement = {
                timestamp: Date.now(),
                roundTripLatency: actualRoundTripLatency, // 実測値をそのまま使用
                audioBufferLatency,
                processingLatency: actualProcessingLatency // 実測値をそのまま使用
            };

            this.measurements.latency.push(measurement);

            // Keep only recent measurements
            if (this.measurements.latency.length > 100) {
                this.measurements.latency.shift();
            }

            console.log(`[PerformanceMonitor] AudioWorklet Precision Latency: ${measurement.roundTripLatency.toFixed(3)}ms (buffer: ${audioBufferLatency.toFixed(3)}ms, processing: ${measurement.processingLatency.toFixed(3)}ms)`);
            console.log(`[PerformanceMonitor] AudioContext - baseLatency: ${this.ctx.baseLatency?.toFixed(6)}s, outputLatency: ${this.ctx.outputLatency?.toFixed(6)}s, sampleRate: ${this.ctx.sampleRate}Hz`);

            if (workletTimingData) {
                console.log(`[PerformanceMonitor] AudioWorklet Internal Timing: ${workletTimingData.processingTime.toFixed(3)}ms (samples: ${workletTimingData.processedSamples})`);
            }

            return measurement;

        } catch (error) {
            console.error('[PerformanceMonitor] AudioWorklet latency measurement failed:', error);
            // Fallback to traditional measurement
            return await this.measureTraditionalLatency(startTime);
        }
    }

    /**
     * 従来のレイテンシ測定 (Fallback)
     */
    private async measureTraditionalLatency(startTime: number): Promise<LatencyMeasurement> {
        // Test oscillator setup
        const oscillator = this.ctx.createOscillator();
        const analyser = this.ctx.createAnalyser();
        const gainNode = this.ctx.createGain();

        oscillator.frequency.setValueAtTime(1000, this.ctx.currentTime);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.01, this.ctx.currentTime); // Very quiet

        oscillator.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(this.ctx.destination);

        // Start measurement
        oscillator.start();
        oscillator.stop(this.ctx.currentTime + 0.1);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 150));

        const endTime = performance.now();
        const roundTripLatency = endTime - startTime;

        // Calculate component latencies
        const audioBufferLatency = this.ctx.baseLatency ? this.ctx.baseLatency * 1000 : 5.8;
        const processingLatency = Math.max(0, roundTripLatency - audioBufferLatency);

        const measurement: LatencyMeasurement = {
            timestamp: Date.now(),
            roundTripLatency,
            audioBufferLatency,
            processingLatency
        };

        this.measurements.latency.push(measurement);

        // Keep only recent measurements
        if (this.measurements.latency.length > 100) {
            this.measurements.latency.shift();
        }

        console.log(`[PerformanceMonitor] Traditional Latency: ${roundTripLatency.toFixed(2)}ms (buffer: ${audioBufferLatency.toFixed(2)}ms, processing: ${processingLatency.toFixed(2)}ms)`);

        return measurement;
    }

    /**
     * AudioWorklet利用可能性チェック
     */
    private isAudioWorkletAvailable(): boolean {
        return !!(this.ctx.audioWorklet && 'addModule' in this.ctx.audioWorklet);
    }

    /**
     * メモリ使用量測定
     */
    measureMemoryUsage(): MemoryMeasurement {
        const measurement: MemoryMeasurement = {
            timestamp: Date.now(),
            heapUsed: 0,
            heapTotal: 0,
            audioBufferMemory: this.estimateAudioBufferMemory(),
            workletMemory: this.estimateWorkletMemory()
        };

        // Performance Memory API (Chrome)
        if ('memory' in performance) {
            const memory = (performance as any).memory;
            measurement.heapUsed = memory.usedJSHeapSize;
            measurement.heapTotal = memory.totalJSHeapSize;
        }

        this.measurements.memory.push(measurement);

        // Keep only recent measurements
        if (this.measurements.memory.length > 100) {
            this.measurements.memory.shift();
        }

        return measurement;
    }

    /**
     * CPU使用率測定 (推定)
     */
    measureCPUUsage(): CPUMeasurement {
        const startTime = performance.now();

        // CPU負荷テスト
        let iterations = 0;
        const testDuration = 10; // 10ms
        const endTime = startTime + testDuration;

        while (performance.now() < endTime) {
            iterations++;
            Math.random() * Math.random(); // Light computation
        }

        const actualDuration = performance.now() - startTime;
        const efficiency = testDuration / actualDuration;
        const usage = Math.max(0, Math.min(100, (1 - efficiency) * 100));

        const measurement: CPUMeasurement = {
            timestamp: Date.now(),
            mainThreadUsage: usage,
            audioThreadUsage: this.estimateAudioThreadUsage(),
            totalUsage: usage
        };

        this.measurements.cpu.push(measurement);

        // Keep only recent measurements
        if (this.measurements.cpu.length > 100) {
            this.measurements.cpu.shift();
        }

        return measurement;
    }

    /**
     * パフォーマンス統計取得
     */
    getPerformanceStats(): {
        latency: {
            current: number;
            average: number;
            min: number;
            max: number;
        };
        memory: {
            current: number;
            average: number;
            peak: number;
        };
        cpu: {
            current: number;
            average: number;
            peak: number;
        };
        quality: 'excellent' | 'good' | 'fair' | 'poor';
    } {
        const latencyStats = this.calculateLatencyStats();
        const memoryStats = this.calculateMemoryStats();
        const cpuStats = this.calculateCPUStats();

        const quality = this.assessPerformanceQuality(latencyStats, memoryStats, cpuStats);

        return {
            latency: latencyStats,
            memory: memoryStats,
            cpu: cpuStats,
            quality
        };
    }

    /**
     * パフォーマンスレポート生成
     */
    generateReport(): string {
        const stats = this.getPerformanceStats();

        return `
Performance Report (${new Date().toLocaleString()})
========================================

Audio Latency:
  Current: ${stats.latency.current.toFixed(2)}ms
  Average: ${stats.latency.average.toFixed(2)}ms
  Range: ${stats.latency.min.toFixed(2)}ms - ${stats.latency.max.toFixed(2)}ms

Memory Usage:
  Current: ${(stats.memory.current / 1024 / 1024).toFixed(2)}MB
  Average: ${(stats.memory.average / 1024 / 1024).toFixed(2)}MB
  Peak: ${(stats.memory.peak / 1024 / 1024).toFixed(2)}MB

CPU Usage:
  Current: ${stats.cpu.current.toFixed(1)}%
  Average: ${stats.cpu.average.toFixed(1)}%
  Peak: ${stats.cpu.peak.toFixed(1)}%

Overall Quality: ${stats.quality.toUpperCase()}

Recommendations:
${this.generateRecommendations(stats)}
    `.trim();
    }

    /**
     * パフォーマンス最適化推奨事項
     */
    private generateRecommendations(stats: any): string {
        const recommendations: string[] = [];

        if (stats.latency.average > 20) {
            recommendations.push('- Consider AudioWorklet migration for lower latency');
        }

        if (stats.memory.peak > 200 * 1024 * 1024) { // 200MB
            recommendations.push('- Implement buffer pooling to reduce memory usage');
        }

        if (stats.cpu.average > 30) {
            recommendations.push('- Optimize audio processing algorithms');
        }

        if (recommendations.length === 0) {
            recommendations.push('- Performance is optimal for current workload');
        }

        return recommendations.join('\n');
    }

    /**
     * 全体的なパフォーマンス品質評価
     */
    private assessPerformanceQuality(latency: any, memory: any, cpu: any): 'excellent' | 'good' | 'fair' | 'poor' {
        let score = 0;

        // Latency scoring
        if (latency.average < 10) score += 3;
        else if (latency.average < 20) score += 2;
        else if (latency.average < 50) score += 1;

        // Memory scoring  
        const memoryMB = memory.peak / 1024 / 1024;
        if (memoryMB < 100) score += 3;
        else if (memoryMB < 200) score += 2;
        else if (memoryMB < 500) score += 1;

        // CPU scoring
        if (cpu.average < 15) score += 3;
        else if (cpu.average < 30) score += 2;
        else if (cpu.average < 50) score += 1;

        if (score >= 8) return 'excellent';
        if (score >= 6) return 'good';
        if (score >= 3) return 'fair';
        return 'poor';
    }

    // Private helper methods
    private collectMeasurements(): void {
        if (!this.isMonitoring) return;

        this.measureMemoryUsage();
        this.measureCPUUsage();

        // Measure latency less frequently (every 5 seconds)
        if (this.measurements.latency.length === 0 ||
            Date.now() - this.measurements.latency[this.measurements.latency.length - 1].timestamp > 5000) {
            this.measureAudioLatency();
        }
    }

    private calculateLatencyStats(): { current: number; average: number; min: number; max: number } {
        if (this.measurements.latency.length === 0) {
            return { current: 0, average: 0, min: 0, max: 0 };
        }

        const latencies = this.measurements.latency.map(m => m.roundTripLatency);
        const current = latencies[latencies.length - 1];
        const average = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        const min = Math.min(...latencies);
        const max = Math.max(...latencies);

        return { current, average, min, max };
    }

    private calculateMemoryStats(): { current: number; average: number; peak: number } {
        if (this.measurements.memory.length === 0) {
            return { current: 0, average: 0, peak: 0 };
        }

        const memories = this.measurements.memory.map(m => m.heapUsed);
        const current = memories[memories.length - 1];
        const average = memories.reduce((sum, val) => sum + val, 0) / memories.length;
        const peak = Math.max(...memories);

        return { current, average, peak };
    }

    private calculateCPUStats(): { current: number; average: number; peak: number } {
        if (this.measurements.cpu.length === 0) {
            return { current: 0, average: 0, peak: 0 };
        }

        const cpus = this.measurements.cpu.map(m => m.totalUsage);
        const current = cpus[cpus.length - 1];
        const average = cpus.reduce((sum, val) => sum + val, 0) / cpus.length;
        const peak = Math.max(...cpus);

        return { current, average, peak };
    }

    private estimateAudioBufferMemory(): number {
        // Rough estimation based on typical buffer sizes
        const bufferSize = this.ctx.sampleRate * 0.1; // 100ms buffer
        const channelCount = 2; // Stereo
        const bytesPerSample = 4; // 32-bit float
        return bufferSize * channelCount * bytesPerSample;
    }

    private estimateWorkletMemory(): number {
        // Estimation for AudioWorklet memory usage
        return window.testSignalManagerV2 ? 1024 * 1024 : 0; // 1MB if worklet active
    }

    private estimateAudioThreadUsage(): number {
        // Simple estimation based on active audio nodes
        const activeNodes = document.querySelectorAll('[data-audio-active]').length;
        return Math.min(50, activeNodes * 5); // 5% per active node, max 50%
    }

    private cleanupLatencyTest(): void {
        if (this.latencyTestOscillator) {
            try {
                this.latencyTestOscillator.stop();
                this.latencyTestOscillator.disconnect();
            } catch (e) {
                // Ignore cleanup errors
            }
            this.latencyTestOscillator = undefined;
        }

        if (this.latencyTestAnalyser) {
            try {
                this.latencyTestAnalyser.disconnect();
            } catch (e) {
                // Ignore cleanup errors
            }
            this.latencyTestAnalyser = undefined;
        }
    }

    /**
     * リソースクリーンアップ
     */
    dispose(): void {
        this.stopMonitoring();
        this.measurements.latency = [];
        this.measurements.memory = [];
        this.measurements.cpu = [];
    }
}

// グローバル型拡張
declare global {
    interface Window {
        performanceMonitor?: PerformanceMonitor;
    }
}
