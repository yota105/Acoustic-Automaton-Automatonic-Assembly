import p5 from "p5";
import { resumeAudio } from "../../audio/core/audioCore";

// グローバルにp5インスタンスを保存
declare global {
    interface Window {
        p5Instance?: p5;
    }
}

export class P5Visualizer {
    private p5Instance: p5;

    constructor(container?: HTMLElement) {
        this.p5Instance = new p5((p) => {
            let dia = 100;

            p.setup = () => {
                const canvas = p.createCanvas(800, 600);
                canvas.id('p5-canvas'); // IDを設定
                p.noStroke();
            };

            p.draw = () => {
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

    // クリーンアップ
    destroy() {
        if (this.p5Instance) {
            this.p5Instance.remove();
        }
    }
}
