/**
 * Memory Manager for Phase 4b Memory Optimization
 * Advanced memory tracking and buffer pooling system
 */

export interface MemoryStats {
    heapUsed: number;
    heapTotal: number;
    audioBuffers: number;
    faustModules: number;
    visualizerData: number;
    testSignalBuffers: number;
    timestamp: number;
}

export interface BufferPoolStats {
    totalPools: number;
    totalBuffers: number;
    poolSizes: Map<number, number>;
    memoryUsage: number;
}

export class MemoryManager {
    private static instance: MemoryManager;
    private bufferPools: Map<number, Float32Array[]> = new Map();
    private maxPoolSize = 20; // 各サイズプールの最大バッファ数
    private memoryStats: MemoryStats[] = [];
    private faustModuleCache: Map<string, WebAssembly.Module> = new Map();
    private monitoringInterval?: number;

    private constructor() {
        this.startMemoryMonitoring();
    }

    static getInstance(): MemoryManager {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager();
        }
        return MemoryManager.instance;
    }

    /**
     * メモリ監視開始
     */
    private startMemoryMonitoring(): void {
        this.monitoringInterval = window.setInterval(() => {
            this.collectMemoryStats();
        }, 5000); // 5秒間隔
    }

    /**
     * メモリ統計収集
     */
    private collectMemoryStats(): void {
        const stats: MemoryStats = {
            heapUsed: this.getHeapUsed(),
            heapTotal: this.getHeapTotal(),
            audioBuffers: this.calculateAudioBufferMemory(),
            faustModules: this.calculateFaustModuleMemory(),
            visualizerData: this.calculateVisualizerMemory(),
            testSignalBuffers: this.calculateTestSignalBufferMemory(),
            timestamp: Date.now()
        };

        this.memoryStats.push(stats);

        // 最新100件のみ保持
        if (this.memoryStats.length > 100) {
            this.memoryStats.shift();
        }

        console.log('[MemoryManager] Memory Stats:', {
            heapUsed: `${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
            audioBuffers: `${(stats.audioBuffers / 1024 / 1024).toFixed(2)}MB`,
            faustModules: `${(stats.faustModules / 1024 / 1024).toFixed(2)}MB`,
            testSignalBuffers: `${(stats.testSignalBuffers / 1024 / 1024).toFixed(2)}MB`,
            total: `${((stats.heapUsed + stats.audioBuffers + stats.faustModules) / 1024 / 1024).toFixed(2)}MB`
        });
    }

    /**
     * オーディオバッファプール管理
     */
    getBuffer(size: number): Float32Array {
        let pool = this.bufferPools.get(size);
        if (!pool) {
            pool = [];
            this.bufferPools.set(size, pool);
        }

        if (pool.length > 0) {
            const buffer = pool.pop()!;
            console.log(`[MemoryManager] Reused buffer size ${size}, pool remaining: ${pool.length}`);
            return buffer;
        }

        console.log(`[MemoryManager] Created new buffer size ${size}`);
        return new Float32Array(size);
    }

    releaseBuffer(buffer: Float32Array): void {
        const size = buffer.length;
        let pool = this.bufferPools.get(size);
        
        if (!pool) {
            pool = [];
            this.bufferPools.set(size, pool);
        }

        // プールサイズ制限
        if (pool.length < this.maxPoolSize) {
            buffer.fill(0); // バッファクリア
            pool.push(buffer);
            console.log(`[MemoryManager] Released buffer size ${size}, pool size: ${pool.length}`);
        } else {
            console.log(`[MemoryManager] Discarded buffer size ${size} (pool full)`);
        }
    }

    /**
     * Faustモジュールキャッシュ管理
     */
    cacheFaustModule(moduleId: string, module: WebAssembly.Module): void {
        this.faustModuleCache.set(moduleId, module);
        console.log(`[MemoryManager] Cached Faust module: ${moduleId}`);
    }

    getFaustModule(moduleId: string): WebAssembly.Module | null {
        return this.faustModuleCache.get(moduleId) || null;
    }

    evictFaustModule(moduleId: string): void {
        if (this.faustModuleCache.delete(moduleId)) {
            console.log(`[MemoryManager] Evicted Faust module: ${moduleId}`);
        }
    }

    /**
     * メモリ使用量計算
     */
    private getHeapUsed(): number {
        if ('memory' in performance) {
            return (performance as any).memory.usedJSHeapSize || 0;
        }
        return 0;
    }

    private getHeapTotal(): number {
        if ('memory' in performance) {
            return (performance as any).memory.totalJSHeapSize || 0;
        }
        return 0;
    }

    private calculateAudioBufferMemory(): number {
        let total = 0;
        for (const [size, pool] of this.bufferPools) {
            total += size * pool.length * 4; // Float32 = 4 bytes
        }
        return total;
    }

    private calculateFaustModuleMemory(): number {
        // Faustモジュールのおおよそのサイズ推定
        return this.faustModuleCache.size * 1024 * 1024; // 1MB per module estimate
    }

    private calculateVisualizerMemory(): number {
        // ビジュアライザーデータのメモリ使用量推定
        // 実装後に詳細計算を追加
        return 0;
    }

    private calculateTestSignalBufferMemory(): number {
        // TestSignalManagerのバッファメモリ推定
        // 44,100 samples * 4 bytes = 176KB per buffer
        return 44100 * 4;
    }

    /**
     * バッファプール統計取得
     */
    getBufferPoolStats(): BufferPoolStats {
        let totalBuffers = 0;
        let memoryUsage = 0;
        const poolSizes = new Map<number, number>();

        for (const [size, pool] of this.bufferPools) {
            totalBuffers += pool.length;
            memoryUsage += size * pool.length * 4;
            poolSizes.set(size, pool.length);
        }

        return {
            totalPools: this.bufferPools.size,
            totalBuffers,
            poolSizes,
            memoryUsage
        };
    }

    /**
     * 最新メモリ統計取得
     */
    getLatestMemoryStats(): MemoryStats | null {
        return this.memoryStats.length > 0 ? this.memoryStats[this.memoryStats.length - 1] : null;
    }

    /**
     * メモリ統計履歴取得
     */
    getMemoryHistory(): MemoryStats[] {
        return [...this.memoryStats];
    }

    /**
     * メモリクリーンアップ
     */
    cleanup(): void {
        // バッファプールクリア
        this.bufferPools.clear();
        
        // Faustモジュールキャッシュクリア
        this.faustModuleCache.clear();
        
        // 監視停止
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        console.log('[MemoryManager] Memory cleanup completed');
    }

    /**
     * メモリ最適化実行 (Phase 4b Enhanced)
     */
    optimize(): void {
        let freedMemory = 0;
        let optimizedPools = 0;
        let optimizedModules = 0;

        // 詳細バッファプール最適化
        for (const [size, pool] of this.bufferPools) {
            const originalLength = pool.length;
            if (pool.length > 10) {
                const removed = pool.splice(10);
                freedMemory += removed.length * size * 4;
                optimizedPools++;
                console.log(`[MemoryManager] Optimized pool size ${size}: ${originalLength} → ${pool.length} buffers (freed ${removed.length})`);
            }
        }

        // Faustモジュールキャッシュの最適化（LRU的に古いものを削除）
        const originalModuleCount = this.faustModuleCache.size;
        if (this.faustModuleCache.size > 5) {
            const entries = Array.from(this.faustModuleCache.entries());
            const toRemove = entries.slice(0, entries.length - 5);
            for (const [moduleId] of toRemove) {
                this.faustModuleCache.delete(moduleId);
                freedMemory += 1024 * 1024; // 推定1MB
                optimizedModules++;
            }
        }

        // 詳細最適化レポート
        console.log(`[MemoryManager] Optimization completed:`, {
            freedMemory: `${(freedMemory / 1024 / 1024).toFixed(2)}MB`,
            optimizedPools: `${optimizedPools} pools`,
            optimizedModules: `${optimizedModules} modules`,
            moduleCache: `${originalModuleCount} → ${this.faustModuleCache.size} modules`,
            bufferPools: `${this.bufferPools.size} active pools`
        });

        // 強制ガベージコレクション（可能であれば）
        if (typeof (globalThis as any).gc === 'function') {
            (globalThis as any).gc();
            console.log('[MemoryManager] Forced garbage collection executed');
        }
    }

    /**
     * ストレステスト用バッファ生成 (Phase 4b Testing)
     */
    createStressTestBuffers(): void {
        console.log('[MemoryManager] Creating stress test buffers...');
        
        const sizes = [128, 256, 512, 1024, 2048, 4096];
        const buffersPerSize = 15;
        
        for (const size of sizes) {
            console.log(`[MemoryManager] Creating ${buffersPerSize} buffers of size ${size}...`);
            const buffers: Float32Array[] = [];
            
            // バッファ生成
            for (let i = 0; i < buffersPerSize; i++) {
                const buffer = this.getBuffer(size);
                // テストデータで埋める
                for (let j = 0; j < size; j++) {
                    buffer[j] = Math.sin(2 * Math.PI * j / size);
                }
                buffers.push(buffer);
            }
            
            // 半分のバッファを即座に解放（プールに戻す）
            const halfCount = Math.floor(buffersPerSize / 2);
            for (let i = 0; i < halfCount; i++) {
                this.releaseBuffer(buffers[i]);
            }
            
            console.log(`[MemoryManager] Released ${halfCount} buffers back to pool for size ${size}`);
        }
        
        // 統計表示
        const poolStats = this.getBufferPoolStats();
        console.log('[MemoryManager] Stress test buffer pools created:', {
            totalPools: poolStats.totalPools,
            totalBuffers: poolStats.totalBuffers,
            memoryUsage: `${(poolStats.memoryUsage / 1024 / 1024).toFixed(2)}MB`
        });
    }
}

export const memoryManager = MemoryManager.getInstance();
