import { getCurrentWindow } from '@tauri-apps/api/window';

export interface VisualizerCommand {
    type: string;
    width?: string;
    height?: string;
    borderless?: boolean;
    decorated?: boolean;
}

export class WindowController {
    private isTauriEnv: boolean;
    private currentWindow: any = null;

    constructor() {
        this.isTauriEnv = typeof window.__TAURI__ !== 'undefined';

        if (this.isTauriEnv) {
            try {
                this.currentWindow = getCurrentWindow();
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Failed to get current window:", error);
            }
        }
    }

    // ビジュアライザーコマンドを処理する
    async handleCommand(msg: VisualizerCommand): Promise<void> {
        if (!msg || typeof msg !== "object" || !msg.type) {
            console.log("[WINDOW_CONTROLLER] Invalid message format");
            return;
        }

        console.log(`[WINDOW_CONTROLLER] Processing command: ${msg.type}`);

        const canvas = document.querySelector("canvas");
        if (!canvas) {
            console.log("[WINDOW_CONTROLLER] Canvas not found");
            return;
        }

        switch (msg.type) {
            case "toggle-visibility":
                await this.toggleVisibility(canvas);
                break;

            case "toggle-border":
                await this.toggleBorder(canvas);
                break;

            case "toggle-maximize":
                await this.toggleMaximize(canvas);
                break;

            case "fullscreen":
                await this.toggleFullscreen(canvas);
                break;

            case "borderless-maximize":
                await this.borderlessMaximize(canvas);
                break;

            case "maximize":
                await this.maximize(canvas);
                break;

            case "normal":
                await this.restoreNormal(canvas, msg.borderless);
                break;

            case "resize":
                await this.resize(canvas, msg.width, msg.height);
                break;

            case "minimize":
                await this.minimize();
                break;

            case "restore-normal":
                await this.restoreToNormal(canvas);
                break;

            case "center":
                await this.center();
                break;

            case "toggle-always-on-top":
                await this.toggleAlwaysOnTop();
                break;
            case "set-decorations":
                if (typeof msg.decorated === 'boolean') {
                    await this.setDecorations(canvas, msg.decorated);
                } else {
                    console.log('[WINDOW_CONTROLLER] Missing decorated value for set-decorations command');
                }
                break;

            default:
                console.log(`[WINDOW_CONTROLLER] Unknown command: ${msg.type}`);
        }
    }

    private async toggleVisibility(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                const isVisible = await this.currentWindow.isVisible();
                if (isVisible) {
                    await this.currentWindow.hide();
                    console.log("[WINDOW_CONTROLLER] Window hidden via Tauri API");
                } else {
                    await this.currentWindow.show();
                    console.log("[WINDOW_CONTROLLER] Window shown via Tauri API");
                }
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri visibility toggle failed, using fallback:", error);
                canvas.style.display = (canvas.style.display === "none") ? "block" : "none";
            }
        } else {
            canvas.style.display = (canvas.style.display === "none") ? "block" : "none";
            console.log(`[WINDOW_CONTROLLER] Visibility toggled: ${canvas.style.display}`);
        }
    }

    private async toggleBorder(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                const isDecorated = await this.currentWindow.isDecorated();
                await this.currentWindow.setDecorations(!isDecorated);
                console.log(`[WINDOW_CONTROLLER] Window decorations toggled via Tauri API: ${!isDecorated}`);
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri decoration toggle failed, using fallback:", error);
                canvas.style.border = (canvas.style.border === "2px solid #333") ? "none" : "2px solid #333";
            }
        } else {
            canvas.style.border = (canvas.style.border === "2px solid #333") ? "none" : "2px solid #333";
            console.log(`[WINDOW_CONTROLLER] Border toggled: ${canvas.style.border}`);
        }
    }

    private async toggleMaximize(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                const isMaximized = await this.currentWindow.isMaximized();
                if (isMaximized) {
                    await this.currentWindow.unmaximize();
                    console.log("[WINDOW_CONTROLLER] Window unmaximized via Tauri API");
                } else {
                    await this.currentWindow.maximize();
                    console.log("[WINDOW_CONTROLLER] Window maximized via Tauri API");
                }
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri maximize toggle failed, using fallback:", error);
                this.cssMaximize(canvas);
            }
        } else {
            this.cssMaximize(canvas);
        }
    }

    private async toggleFullscreen(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                const isFullscreen = await this.currentWindow.isFullscreen();
                await this.currentWindow.setFullscreen(!isFullscreen);
                console.log(`[WINDOW_CONTROLLER] Fullscreen toggled via Tauri API: ${!isFullscreen}`);
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri fullscreen failed, using fallback:", error);
                if (canvas.requestFullscreen) {
                    canvas.requestFullscreen();
                    console.log("[WINDOW_CONTROLLER] Fullscreen requested via DOM API");
                }
            }
        } else {
            if (canvas.requestFullscreen) {
                canvas.requestFullscreen();
                console.log("[WINDOW_CONTROLLER] Fullscreen requested");
            }
        }
    }

    private async borderlessMaximize(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.setDecorations(false);
                await this.currentWindow.maximize();
                console.log("[WINDOW_CONTROLLER] Borderless maximize via Tauri API");
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri borderless maximize failed, using fallback:", error);
                this.cssBorderlessMaximize(canvas);
            }
        } else {
            this.cssBorderlessMaximize(canvas);
        }
    }

    private async maximize(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.maximize();
                console.log("[WINDOW_CONTROLLER] Window maximized via Tauri API");
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri maximize failed, using fallback:", error);
                this.cssBorderlessMaximize(canvas);
            }
        } else {
            this.cssBorderlessMaximize(canvas);
        }
    }

    private async restoreNormal(canvas: HTMLElement, borderless?: boolean): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.unmaximize();
                await this.currentWindow.setFullscreen(false);
                await this.currentWindow.setDecorations(true);
                console.log("[WINDOW_CONTROLLER] Window restored to normal via Tauri API");
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri normal restore failed, using fallback:", error);
                this.cssRestoreNormal(canvas, borderless);
            }
        } else {
            this.cssRestoreNormal(canvas, borderless);
        }
    }

    private async resize(canvas: HTMLElement, width?: string, height?: string): Promise<void> {
        if (width && height) {
            const w = parseInt(width.replace('px', ''));
            const h = parseInt(height.replace('px', ''));

            if (this.currentWindow) {
                try {
                    await this.currentWindow.setSize({ width: w, height: h });
                    console.log(`[WINDOW_CONTROLLER] Window resized via Tauri API to ${w}x${h}`);
                } catch (error) {
                    console.log("[WINDOW_CONTROLLER] Tauri resize failed, using fallback:", error);
                    canvas.style.width = width;
                    canvas.style.height = height;
                }
            } else {
                canvas.style.width = width;
                canvas.style.height = height;
            }
        }
    }

    private async minimize(): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.minimize();
                console.log("[WINDOW_CONTROLLER] Window minimized via Tauri API");
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri minimize failed:", error);
            }
        } else {
            console.log("[WINDOW_CONTROLLER] Minimize not available in browser mode");
        }
    }

    private async restoreToNormal(canvas: HTMLElement): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.unmaximize();
                await this.currentWindow.setFullscreen(false);
                await this.currentWindow.setDecorations(true);
                await this.currentWindow.show();
                console.log("[WINDOW_CONTROLLER] Window restored to normal via Tauri API");
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri restore failed, using fallback:", error);
                this.cssRestoreNormal(canvas);
            }
        } else {
            this.cssRestoreNormal(canvas);
        }
    }

    private async center(): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.center();
                console.log("[WINDOW_CONTROLLER] Window centered via Tauri API");
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri center failed:", error);
            }
        } else {
            console.log("[WINDOW_CONTROLLER] Center not available in browser mode");
        }
    }

    private async toggleAlwaysOnTop(): Promise<void> {
        if (this.currentWindow) {
            try {
                const isAlwaysOnTop = await this.currentWindow.isAlwaysOnTop();
                await this.currentWindow.setAlwaysOnTop(!isAlwaysOnTop);
                console.log(`[WINDOW_CONTROLLER] Always on top toggled via Tauri API: ${!isAlwaysOnTop}`);
            } catch (error) {
                console.log("[WINDOW_CONTROLLER] Tauri always on top toggle failed:", error);
            }
        } else {
            console.log("[WINDOW_CONTROLLER] Always on top not available in browser mode");
        }
    }

    private async setDecorations(canvas: HTMLElement, decorated: boolean): Promise<void> {
        if (this.currentWindow) {
            try {
                await this.currentWindow.setDecorations(decorated);
                console.log(`[WINDOW_CONTROLLER] Decorations set via Tauri API: ${decorated}`);
            } catch (error) {
                console.log('[WINDOW_CONTROLLER] Tauri setDecorations failed, using fallback:', error);
                this.applyCssDecorations(canvas, decorated);
            }
        } else {
            this.applyCssDecorations(canvas, decorated);
        }
    }

    private applyCssDecorations(canvas: HTMLElement, decorated: boolean): void {
        canvas.style.border = decorated ? "2px solid #333" : "none";
        console.log(`[WINDOW_CONTROLLER] Decorations applied via CSS: ${decorated ? 'decorated' : 'borderless'}`);
    }

    // CSS用のヘルパーメソッド
    private cssMaximize(canvas: HTMLElement): void {
        if (canvas.style.position !== "fixed") {
            canvas.style.position = "fixed";
            canvas.style.left = "0";
            canvas.style.top = "0";
            canvas.style.width = "100vw";
            canvas.style.height = "100vh";
            canvas.style.zIndex = "1000";
            canvas.style.border = "none";
            console.log("[WINDOW_CONTROLLER] CSS Maximized");
        } else {
            this.cssRestoreNormal(canvas);
        }
    }

    private cssBorderlessMaximize(canvas: HTMLElement): void {
        canvas.style.position = "fixed";
        canvas.style.left = "0";
        canvas.style.top = "0";
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        canvas.style.zIndex = "1000";
        canvas.style.border = "none";
        console.log("[WINDOW_CONTROLLER] Borderless maximize applied");
    }

    private cssRestoreNormal(canvas: HTMLElement, borderless?: boolean): void {
        canvas.style.position = "";
        canvas.style.left = "";
        canvas.style.top = "";
        canvas.style.width = "800px";
        canvas.style.height = "600px";
        canvas.style.zIndex = "";
        canvas.style.border = borderless ? "none" : "2px solid #333";
        console.log("[WINDOW_CONTROLLER] Restored to normal size");
    }
}
