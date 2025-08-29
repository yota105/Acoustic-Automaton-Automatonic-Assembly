import { P5Visualizer } from './p5Visualizer';
import { ThreeJSVisualizer } from './threeJSVisualizer';
import { WindowController, VisualizerCommand } from './windowController';

export class VisualizerManager {
    private p5Visualizer: P5Visualizer;
    private threeJSVisualizer: ThreeJSVisualizer;
    private windowController: WindowController;

    constructor() {
        // ビジュアライザーの初期化
        this.p5Visualizer = new P5Visualizer();
        this.threeJSVisualizer = new ThreeJSVisualizer();
        this.windowController = new WindowController();

        // Three.jsアニメーションを開始
        this.threeJSVisualizer.startAnimation();

        this.setupEventListeners();
        console.log("[VISUALIZER_MANAGER] All visualizers initialized");
    }

    // イベントリスナーの設定
    private setupEventListeners(): void {
        this.setupTauriListeners();
        this.setupPostMessageListener();
    }

    // Tauriイベントリスナーの設定
    private async setupTauriListeners(): Promise<void> {
        if (typeof window.__TAURI__ !== 'undefined' && window.__TAURI__.event) {
            try {
                await window.__TAURI__.event.listen('visualizer-command', (event: any) => {
                    console.log("[VISUALIZER_MANAGER] Received Tauri event:", event.payload);
                    this.handleCommand(event.payload);
                });
                console.log("[VISUALIZER_MANAGER] Tauri event listener setup complete");
            } catch (error) {
                console.log("[VISUALIZER_MANAGER] Failed to setup Tauri event listener:", error);
            }
        } else {
            console.log("[VISUALIZER_MANAGER] Tauri API not available, using postMessage fallback");
        }
    }

    // postMessageリスナーの設定
    private setupPostMessageListener(): void {
        window.addEventListener("message", (event) => {
            console.log("[VISUALIZER_MANAGER] Received postMessage:", event.data);

            // パフォーマンス制御メッセージの処理
            if (event.data.type === 'performance-control') {
                this.handlePerformanceControl(event.data);
                return;
            }

            // 通常のビジュアライザーコマンドの処理
            this.handleCommand(event.data);
        });
    }

    // パフォーマンス制御メッセージのハンドラー
    private handlePerformanceControl(message: any): void {
        const { action, data } = message;
        console.log(`[VISUALIZER_MANAGER] Performance control: ${action}`, data);

        switch (action) {
            case 'startSection':
                this.startSection(data);
                break;
            case 'stopSection':
                this.stopSection();
                break;
            case 'stateUpdate':
                this.updateState(data);
                break;
            case 'requestState':
                this.sendCurrentState();
                break;
            default:
                console.warn(`[VISUALIZER_MANAGER] Unknown performance action: ${action}`);
        }
    }

    // セクション開始の処理
    private startSection(sectionId: string): void {
        console.log(`[VISUALIZER_MANAGER] Starting section: ${sectionId}`);

        // セクションに応じてビジュアライザーを設定
        switch (sectionId) {
            case 'test':
                // テストモード: シンプルな表示
                this.p5Visualizer.setTestMode(true);
                this.threeJSVisualizer.setTestMode(true);
                break;
            case 'section1':
                // セクション1: 導入部
                this.p5Visualizer.setSectionMode(1);
                this.threeJSVisualizer.setSectionMode(1);
                break;
            case 'section2':
                // セクション2: 座標移動
                this.p5Visualizer.setSectionMode(2);
                this.threeJSVisualizer.setSectionMode(2);
                break;
            case 'section3':
                // セクション3: 軸回転
                this.p5Visualizer.setSectionMode(3);
                this.threeJSVisualizer.setSectionMode(3);
                break;
        }
    }

    // セクション停止の処理
    private stopSection(): void {
        console.log('[VISUALIZER_MANAGER] Stopping section');
        this.p5Visualizer.setTestMode(false);
        this.threeJSVisualizer.setTestMode(false);
    }

    // 状態更新の処理
    private updateState(state: any): void {
        console.log('[VISUALIZER_MANAGER] State updated:', state);
        // 必要に応じて状態に基づいてビジュアライザーを更新
    }

    // 現在の状態を送信
    private sendCurrentState(): void {
        // Controller側に現在の状態を返信
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'visualizer-status',
                ready: true,
                timestamp: Date.now()
            }, '*');
        }
    }

    // コマンドハンドラー
    private async handleCommand(command: VisualizerCommand): Promise<void> {
        // ウィンドウ制御コマンドを処理
        await this.windowController.handleCommand(command);

        // リサイズコマンドの場合、ビジュアライザーもリサイズ
        if (command.type === "resize" && command.width && command.height) {
            const width = parseInt(command.width.replace('px', ''));
            const height = parseInt(command.height.replace('px', ''));

            this.p5Visualizer.resize(width, height);
            this.threeJSVisualizer.resize(width, height);
        }
    }

    // ビジュアライザーインスタンスの取得
    getP5Visualizer(): P5Visualizer {
        return this.p5Visualizer;
    }

    getThreeJSVisualizer(): ThreeJSVisualizer {
        return this.threeJSVisualizer;
    }

    getWindowController(): WindowController {
        return this.windowController;
    }

    // クリーンアップ
    destroy(): void {
        this.p5Visualizer.destroy();
        this.threeJSVisualizer.destroy();
        console.log("[VISUALIZER_MANAGER] All visualizers destroyed");
    }
}
