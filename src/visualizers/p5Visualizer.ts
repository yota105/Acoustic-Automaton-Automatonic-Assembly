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
    private currentMode: 'normal' | 'test' | 'section' = 'normal';
    private sectionNumber: number = 0;

    constructor(container?: HTMLElement) {
        this.p5Instance = new p5((p) => {
            let dia = 100;

            p.setup = () => {
                const canvas = p.createCanvas(800, 600);
                canvas.id('p5-canvas'); // IDを設定
                p.noStroke();
            };

            p.draw = () => {
                this.drawForCurrentMode(p, dia);
                dia = 75 + 25 * Math.sin(p.frameCount * 0.05);
            };

            p.mousePressed = () => resumeAudio();
        }, container || document.getElementById('visualizer-container') || document.body);

        // グローバルに保存
        window.p5Instance = this.p5Instance;
    }

    // 現在のモードに応じた描画
    private drawForCurrentMode(p: p5, dia: number): void {
        switch (this.currentMode) {
            case 'test':
                this.drawTestMode(p, dia);
                break;
            case 'section':
                this.drawSectionMode(p, dia);
                break;
            default:
                this.drawNormalMode(p, dia);
        }
    }

    // 通常モードの描画
    private drawNormalMode(p: p5, dia: number): void {
        p.background(10, 50);
        p.fill(100, 200, 250, 150);
        p.ellipse(p.width / 2, p.height / 2, dia);
    }

    // テストモードの描画
    private drawTestMode(p: p5, dia: number): void {
        p.background(50, 10, 10, 50); // 赤味がかった背景
        p.fill(250, 100, 100, 200);
        p.ellipse(p.width / 2, p.height / 2, dia);

        // "TEST MODE" テキスト表示
        p.fill(255);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(32);
        p.text('TEST MODE', p.width / 2, 50);
    }

    // セクションモードの描画
    private drawSectionMode(p: p5, dia: number): void {
        const colors = [
            [100, 200, 250], // Section 1: 青
            [250, 200, 100], // Section 2: 黄
            [200, 100, 250]  // Section 3: 紫
        ];

        const color = colors[this.sectionNumber - 1] || colors[0];

        p.background(color[0] * 0.1, color[1] * 0.1, color[2] * 0.1, 50);
        p.fill(color[0], color[1], color[2], 200);
        p.ellipse(p.width / 2, p.height / 2, dia);

        // セクション番号表示
        p.fill(255);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(48);
        p.text(`SECTION ${this.sectionNumber}`, p.width / 2, 50);
    }

    // テストモード設定
    setTestMode(enabled: boolean): void {
        this.currentMode = enabled ? 'test' : 'normal';
        console.log(`[P5_VISUALIZER] Test mode: ${enabled}`);
    }

    // セクションモード設定
    setSectionMode(sectionNumber: number): void {
        this.currentMode = 'section';
        this.sectionNumber = sectionNumber;
        console.log(`[P5_VISUALIZER] Section mode: ${sectionNumber}`);
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
