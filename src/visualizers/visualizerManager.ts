import { P5Visualizer } from './p5Visualizer';
import { ThreeJSVisualizer } from './threeJSVisualizer';
import { WindowController, VisualizerCommand } from './windowController';
import { VisualSyncManager } from './visualSyncManager';

export class VisualizerManager {
    private p5Visualizer: P5Visualizer;
    private threeJSVisualizer: ThreeJSVisualizer;
    private windowController: WindowController;
    private visualSyncManager: VisualSyncManager;

    constructor() {
        // ビジュアライザーの初期化
        this.p5Visualizer = new P5Visualizer();
        this.threeJSVisualizer = new ThreeJSVisualizer();
        this.windowController = new WindowController();

        // VisualSyncManagerを初期化
        this.visualSyncManager = new VisualSyncManager();
        this.visualSyncManager.setVisualizers(this.p5Visualizer, this.threeJSVisualizer);

        // 初期状態: 黒画面、アニメーション停止
        this.initializeBlackScreen();

        this.setupEventListeners();
        console.log("[VISUALIZER_MANAGER] All visualizers initialized (black screen mode)");
    }

    /**
     * 初期状態を黒画面に設定
     */
    private initializeBlackScreen(): void {
        this.threeJSVisualizer.clearToBlack();
        this.p5Visualizer.clearToBlack();
        console.log("[VISUALIZER_MANAGER] Initialized to black screen");
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
            this.handleCommand(event.data);
        });
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

    getVisualSyncManager(): VisualSyncManager {
        return this.visualSyncManager;
    }

    // クリーンアップ
    destroy(): void {
        this.p5Visualizer.destroy();
        this.threeJSVisualizer.destroy();
        this.visualSyncManager.destroy();
        console.log("[VISUALIZER_MANAGER] All visualizers destroyed");
    }
}
