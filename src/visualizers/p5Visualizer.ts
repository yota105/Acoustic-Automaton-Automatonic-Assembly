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
            let dia = 100;

            p.setup = () => {
                const canvas = p.createCanvas(800, 600);
                canvas.id('p5-canvas'); // IDを設定
                p.noStroke();
                p.background(0); // 初期状態は黒背景
                p.noLoop(); // 初期状態はループ停止
            };

            p.draw = () => {
                // isDrawingフラグでアニメーションを制御
                if (!this.isDrawing) {
                    return;
                }

                p.background(10, 50); // 半透明背景
                p.fill(100, 200, 250, 150); // 半透明の塗り
                p.ellipse(p.width / 2, p.height / 2, dia);
                dia = 75 + 25 * Math.sin(p.frameCount * 0.05);
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
        this.p5Instance.background(0);
        console.log('[P5_VISUALIZER] Cleared to black');
    }

    // クリーンアップ
    destroy() {
        if (this.p5Instance) {
            this.p5Instance.remove();
        }
    }
}
