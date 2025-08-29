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
        // セクション1: 導入部 - 単音からの発展
        this.sections.set('section1', {
            id: 'section1',
            name: 'セクション1: 導入部 - 単音からの発展',
            duration: 180000, // 3分
            setup: () => {
                console.log('[Controller] Starting Section 1: 導入部 - 単音からの発展');
                this.loadSectionDSP('section1');
                this.startNoteDetection();
                this.scheduleElectronicTriggers();
                // 映像: 3分割フラッシュと軸線の準備
                this.visuals.setSectionMode(1);
            },
            cleanup: () => {
                console.log('[Controller] Ending Section 1');
                this.stopNoteDetection();
            },
            active: false
        });

        // セクション2: 点の座標移動と音高変化
        this.sections.set('section2', {
            id: 'section2',
            name: 'セクション2: 座標移動と音高変化',
            duration: 180000, // 3分
            setup: () => {
                console.log('[Controller] Starting Section 2: 座標移動と音高変化');
                this.loadSectionDSP('section2');
                this.startCoordinateMovement();
                // 映像: 座標移動の開始
                this.visuals.setSectionMode(2);
            },
            cleanup: () => {
                console.log('[Controller] Ending Section 2');
                this.stopCoordinateMovement();
            },
            active: false
        });

        // セクション3: 軸回転と音数・音圧増加
        this.sections.set('section3', {
            id: 'section3',
            name: 'セクション3: 軸回転と音数・音圧増加',
            duration: 240000, // 4分
            setup: () => {
                console.log('[Controller] Starting Section 3: 軸回転と音数・音圧増加');
                this.loadSectionDSP('section3');
                this.startAxisRotation();
                // 映像: 回転開始、音数・音圧増加
                this.visuals.setSectionMode(3);
            },
            cleanup: () => {
                console.log('[Controller] Ending Section 3');
                this.stopAxisRotation();
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
                this.loadSectionDSP('section1'); // テストはセクション1のDSP使用
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
     * セクション専用DSPファイルを読み込み
     */
    private async loadSectionDSP(sectionId: string): Promise<void> {
        try {
            console.log(`[Controller] Loading DSP for ${sectionId}`);
            // DSPファイルのパス
            const dspPath = `/dsp/${sectionId}.dsp`;

            // パフォーマンスシステムにDSPを設定
            await this.performance.loadDSP(dspPath);
            console.log(`[Controller] Successfully loaded ${sectionId} DSP`);
        } catch (error) {
            console.error(`[Controller] Failed to load DSP for ${sectionId}:`, error);
        }
    }

    /**
     * セクション2用：座標移動の開始
     */
    private startCoordinateMovement(): void {
        console.log('[Controller] Starting coordinate movement for Section 2');
        // 座標変化のアニメーション開始
        // 実装: 時間経過に応じてx_coord, y_coordパラメータを変更
    }

    /**
     * セクション2用：座標移動の停止
     */
    private stopCoordinateMovement(): void {
        console.log('[Controller] Stopping coordinate movement');
        // 座標変化のアニメーション停止
    }

    /**
     * セクション3用：軸回転の開始
     */
    private startAxisRotation(): void {
        console.log('[Controller] Starting axis rotation for Section 3');
        // 回転アニメーションと音数増加の開始
        // 実装: rotation_angleとdensityパラメータの制御
    }

    /**
     * セクション3用：軸回転の停止
     */
    private stopAxisRotation(): void {
        console.log('[Controller] Stopping axis rotation');
        // 回転アニメーションの停止
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
