import { P5Visualizer } from './p5Visualizer';
import { ThreeJSVisualizer } from './threeJSVisualizer';
import { WindowController, VisualizerCommand } from './windowController';
import { VisualSyncManager } from './visualSyncManager';
import { ViewportCropper } from './viewportCropper';
import type { ViewportCropCommand, ViewportCropConfig } from './viewportTypes';

export class VisualizerManager {
    private p5Visualizer: P5Visualizer;
    private threeJSVisualizer: ThreeJSVisualizer;
    private windowController: WindowController;
    private visualSyncManager: VisualSyncManager;
    private broadcastChannel: BroadcastChannel | null = null;
    private viewportCropper: ViewportCropper;
    private readonly windowCommandTypes: Set<string> = new Set([
        'toggle-visibility',
        'toggle-border',
        'toggle-maximize',
        'fullscreen',
        'borderless-maximize',
        'maximize',
        'normal',
        'resize',
        'minimize',
        'restore-normal',
        'center',
        'toggle-always-on-top',
        'set-decorations'
    ]);

    constructor() {
        // ビジュアライザーの初期化
        this.p5Visualizer = new P5Visualizer();
        this.threeJSVisualizer = new ThreeJSVisualizer();
        this.windowController = new WindowController();
        this.viewportCropper = new ViewportCropper();

        // VisualSyncManagerを初期化
        this.visualSyncManager = new VisualSyncManager();
        this.visualSyncManager.setVisualizers(this.p5Visualizer, this.threeJSVisualizer);
        this.visualSyncManager.registerVisualizers(this.p5Visualizer, this.threeJSVisualizer);

        // 初期状態: 黒画面、アニメーション停止
        this.initializeBlackScreen();

        this.setupBroadcastChannel();
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

    private setupBroadcastChannel(): void {
        if (typeof BroadcastChannel === 'undefined') {
            console.log('[VISUALIZER_MANAGER] BroadcastChannel not available, window frame sync disabled');
            return;
        }

        try {
            this.broadcastChannel = new BroadcastChannel('performance-control');
            this.broadcastChannel.addEventListener('message', async (event) => {
                await this.handleBroadcastMessage(event.data);
            });
            console.log('[VISUALIZER_MANAGER] BroadcastChannel listener ready');
        } catch (error) {
            console.log('[VISUALIZER_MANAGER] Failed to setup BroadcastChannel:', error);
        }
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
        if (this.windowCommandTypes.has(command.type)) {
            await this.windowController.handleCommand(command);
        }

        // リサイズコマンドの場合、ビジュアライザーもリサイズ
        if (command.type === "resize" && command.width && command.height) {
            const width = parseInt(command.width.replace('px', ''));
            const height = parseInt(command.height.replace('px', ''));

            this.p5Visualizer.resize(width, height);
            this.threeJSVisualizer.resize(width, height);
            this.viewportCropper.applyConfig({}, false);
            return;
        }

        if (command.type === 'set-viewport-crop') {
            this.handleViewportCropCommand(command as ViewportCropCommand | VisualizerCommand);
        }
    }

    private async handleBroadcastMessage(message: any): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }

        if (message.type === 'window-frame') {
            if (message.mode === 'borderless') {
                await this.windowController.handleCommand({ type: 'set-decorations', decorated: false });
            } else if (message.mode === 'decorated') {
                await this.windowController.handleCommand({ type: 'set-decorations', decorated: true });
            }
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
        this.viewportCropper.destroy();
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }
        console.log("[VISUALIZER_MANAGER] All visualizers destroyed");
    }

    private handleViewportCropCommand(command: ViewportCropCommand | VisualizerCommand): void {
        const config = this.extractViewportConfig(command);
        if (!config) {
            console.log('[VISUALIZER_MANAGER] Viewport crop command missing config');
            return;
        }
        this.viewportCropper.applyConfig(config);
        console.log('[VISUALIZER_MANAGER] Viewport crop configuration applied', config);
    }

    private extractViewportConfig(command: ViewportCropCommand | VisualizerCommand): Partial<ViewportCropConfig> | null {
        if ('config' in command && command.config) {
            return command.config;
        }
        if ('payload' in command && command.payload) {
            return command.payload as Partial<ViewportCropConfig>;
        }
        return null;
    }
}
