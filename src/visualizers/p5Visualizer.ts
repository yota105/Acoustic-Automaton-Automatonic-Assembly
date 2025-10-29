import p5 from "p5";
import { resumeAudio } from "../audio/audioCore";

// グローバルにp5インスタンスを保存
declare global {
    interface Window {
        p5Instance?: p5;
    }
}

export class P5Visualizer {
    private p5Instance: p5;
    private isDrawing: boolean = false; // 初期状態は停止

    constructor(container?: HTMLElement) {
        this.p5Instance = new p5((p) => {
            p.setup = () => {
                const canvas = p.createCanvas(800, 600);
                canvas.id('p5-canvas'); // IDを設定
                p.noStroke();
                p.clear(); // 透明背景
                p.noLoop(); // 初期状態はループ停止
            };

            p.draw = () => {
                // isDrawingフラグでアニメーションを制御
                if (!this.isDrawing) {
                    return;
                }

                // 現在は何も描画しない（オーバーレイ用に予約）
                p.clear(); // 透明を維持
            };

            p.mousePressed = () => resumeAudio();
        }, container || document.getElementById('visualizer-container') || document.body);

        // グローバルに保存
        window.p5Instance = this.p5Instance;
    }

    // リサイズメソッド
    resize(width: number, height: number) {
        if (this.p5Instance) {
            this.p5Instance.resizeCanvas(width, height);
            console.log(`[P5_VISUALIZER] Canvas resized to ${width}x${height}`);
        }
    }

    // インスタンスを取得
    getInstance(): p5 {
        return this.p5Instance;
    }

    // アニメーション開始
    start(): void {
        this.isDrawing = true;
        this.p5Instance.loop();
        console.log('[P5_VISUALIZER] Animation started');
    }

    // アニメーション停止
    stop(): void {
        this.isDrawing = false;
        this.p5Instance.noLoop();
        console.log('[P5_VISUALIZER] Animation stopped');
    }

    // 黒画面にクリア
    clearToBlack(): void {
        this.stop();
        this.p5Instance.clear(); // 透明に戻す
        console.log('[P5_VISUALIZER] Cleared to transparent');
    }

    // クリーンアップ
    destroy() {
        if (this.p5Instance) {
            this.p5Instance.remove();
        }
    }
}
