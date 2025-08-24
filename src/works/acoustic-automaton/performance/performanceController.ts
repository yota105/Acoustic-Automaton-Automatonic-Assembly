// 音響的オートマトン - パフォーマンス統合システム
// 音響と映像を統合し、実際のパフォーマンスを実行

import { AcousticAutomatonPerformance, defaultPerformanceConfig, PerformanceConfig } from './acousticAutomaton';
import { AcousticAutomatonVisuals, defaultVisualConfig, VisualConfig } from './visualSystem';

export interface PerformanceSection {
    id: string;
    name: string;
    duration?: number; // ms, undefined = 無制限
    setup?: () => void;
    cleanup?: () => void;
    active: boolean;
}

export class AcousticAutomatonController {
    private audioContext: AudioContext;
    private performance: AcousticAutomatonPerformance;
    private visuals: AcousticAutomatonVisuals;

    // セクション管理
    private currentSection: PerformanceSection | null = null;
    private sections: Map<string, PerformanceSection> = new Map();
    private sectionTimer: number | null = null;

    // 検出タイマー
    private detectionInterval: number | null = null;

    // マイク入力の管理
    private connectedMics: Map<string, GainNode> = new Map();

    constructor(
        canvas: HTMLCanvasElement,
        audioContext?: AudioContext,
        performanceConfig?: Partial<PerformanceConfig>,
        visualConfig?: Partial<VisualConfig>
    ) {
        this.audioContext = audioContext || new AudioContext();

        // 設定のマージ
        const finalPerformanceConfig = { ...defaultPerformanceConfig, ...performanceConfig };
        const finalVisualConfig = { ...defaultVisualConfig, ...visualConfig };

        // システム初期化
        this.performance = new AcousticAutomatonPerformance(this.audioContext, finalPerformanceConfig);
        this.visuals = new AcousticAutomatonVisuals(canvas, finalVisualConfig);

        // セクション定義
        this.definePerformanceSections();

        console.log('[Controller] Performance controller initialized');
    }

    /**
     * パフォーマンスセクションの定義
     */
    private definePerformanceSections(): void {
        // 第1部: 導入部
        this.sections.set('section1', {
            id: 'section1',
            name: '導入部 - 単音からの発展',
            duration: 180000, // 3分
            setup: () => {
                console.log('[Controller] Starting Section 1: Introduction');
                this.startNoteDetection();
                this.scheduleElectronicTriggers();
            },
            cleanup: () => {
                console.log('[Controller] Ending Section 1');
                this.stopNoteDetection();
            },
            active: false
        });

        // 第2部: 移動開始（将来実装）
        this.sections.set('section2', {
            id: 'section2',
            name: '移動開始 - 座標変化',
            setup: () => {
                console.log('[Controller] Starting Section 2: Movement');
            },
            cleanup: () => {
                console.log('[Controller] Ending Section 2');
            },
            active: false
        });

        // テスト用の短いセクション
        this.sections.set('test', {
            id: 'test',
            name: 'テスト - 30秒版',
            duration: 30000, // 30秒
            setup: () => {
                console.log('[Controller] Starting Test Section');
                this.startNoteDetection();
                this.scheduleElectronicTriggers();
            },
            cleanup: () => {
                console.log('[Controller] Ending Test Section');
                this.stopNoteDetection();
            },
            active: false
        });
    }

    /**
     * マイク入力の接続
     */
    connectMicrophone(instrumentId: 'horn1' | 'horn2' | 'trombone', micGainNode: GainNode): void {
        this.connectedMics.set(instrumentId, micGainNode);
        this.performance.connectMicrophoneInput(micGainNode);

        console.log(`[Controller] Connected microphone for ${instrumentId}`);
    }

    /**
     * 手動での音符トリガー（テスト用）
     */
    manualTrigger(instrumentId: 'horn1' | 'horn2' | 'trombone', frequency?: number): void {
        const freq = frequency || 493.88; // B4
        this.performance.triggerAcousticNote(instrumentId, freq);

        console.log(`[Controller] Manual trigger: ${instrumentId} at ${freq}Hz`);
    }

    /**
     * 電子音の手動トリガー（テスト用）
     */
    manualElectronicTrigger(frequency?: number): void {
        const freq = frequency || 493.88; // B4
        this.performance.triggerElectronicNote(freq);

        console.log(`[Controller] Manual electronic trigger at ${freq}Hz`);
    }

    /**
     * セクションの開始
     */
    startSection(sectionId: string): void {
        // 現在のセクションを停止
        if (this.currentSection) {
            this.stopSection();
        }

        const section = this.sections.get(sectionId);
        if (!section) {
            console.error(`[Controller] Section not found: ${sectionId}`);
            return;
        }

        this.currentSection = section;
        section.active = true;

        // セクションのセットアップ実行
        if (section.setup) {
            section.setup();
        }

        // 時間制限があるセクションの場合、タイマー設定
        if (section.duration) {
            this.sectionTimer = window.setTimeout(() => {
                console.log(`[Controller] Section ${sectionId} completed by timer`);
                this.stopSection();
            }, section.duration);
        }

        console.log(`[Controller] Started section: ${section.name}`);
        this.notifyUI('section-started', { sectionId, section });
    }

    /**
     * セクションの停止
     */
    stopSection(): void {
        if (!this.currentSection) return;

        const section = this.currentSection;
        section.active = false;

        // タイマークリア
        if (this.sectionTimer) {
            clearTimeout(this.sectionTimer);
            this.sectionTimer = null;
        }

        // セクションのクリーンアップ実行
        if (section.cleanup) {
            section.cleanup();
        }

        console.log(`[Controller] Stopped section: ${section.name}`);
        this.notifyUI('section-stopped', { sectionId: section.id, section });

        this.currentSection = null;
    }

    /**
     * 音程検出の開始
     */
    private startNoteDetection(): void {
        if (this.detectionInterval) return;

        // 100msごとに音程検出
        this.detectionInterval = window.setInterval(() => {
            if (!this.currentSection?.active) return;

            // 接続されたマイクに対して検出を実行
            this.connectedMics.forEach((_, instrumentId) => {
                this.performance.detectAndTriggerNote(instrumentId as 'horn1' | 'horn2' | 'trombone');
            });
        }, 100);

        console.log('[Controller] Note detection started');
    }

    /**
     * 音程検出の停止
     */
    private stopNoteDetection(): void {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        console.log('[Controller] Note detection stopped');
    }

    /**
     * 電子音の自動トリガー設定
     */
    private scheduleElectronicTriggers(): void {
        // 不規則な間隔で電子音をトリガー
        const scheduleNext = () => {
            if (!this.currentSection?.active) return;

            // 2-8秒のランダム間隔
            const delay = 2000 + Math.random() * 6000;

            setTimeout(() => {
                if (this.currentSection?.active) {
                    // B4周辺の音程をランダムに
                    const baseFreq = 493.88;
                    const variation = (Math.random() - 0.5) * 50; // ±25Hz
                    this.performance.triggerElectronicNote(baseFreq + variation);

                    scheduleNext(); // 次をスケジュール
                }
            }, delay);
        };

        scheduleNext();
    }

    /**
     * UIへの通知
     */
    private notifyUI(eventType: string, data: any): void {
        document.dispatchEvent(new CustomEvent('performance-controller-event', {
            detail: { type: eventType, data }
        }));
    }

    /**
     * 現在のセクション情報を取得
     */
    getCurrentSection(): PerformanceSection | null {
        return this.currentSection;
    }

    /**
     * すべてのセクションリストを取得
     */
    getSections(): PerformanceSection[] {
        return Array.from(this.sections.values());
    }

    /**
     * アクティブな音響インスタンス数を取得
     */
    getActiveInstanceCount(): number {
        return this.performance.getActiveInstances().length;
    }

    /**
     * ウィンドウリサイズ処理
     */
    resize(width: number, height: number): void {
        this.visuals.resize(width, height);
    }

    /**
     * システム全体の停止
     */
    dispose(): void {
        // セクション停止
        this.stopSection();

        // 検出停止
        this.stopNoteDetection();

        // システム停止
        this.performance.dispose();
        this.visuals.dispose();

        // マイク接続クリア
        this.connectedMics.clear();

        console.log('[Controller] Performance controller disposed');
    }
}

// グローバル参照用
declare global {
    interface Window {
        performanceController?: AcousticAutomatonController;
    }
}
