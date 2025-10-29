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
    private showCoordinates: boolean = false; // 座標表示フラグ
    private particlePositions: Array<{ x: number, y: number, z: number }> = []; // パーティクル座標
    private invertColors: boolean = false; // 色反転フラグ

    constructor(container?: HTMLElement) {
        this.p5Instance = new p5((p) => {
            p.setup = () => {
                const canvas = p.createCanvas(800, 600);
                canvas.id('p5-canvas'); // IDを設定
                canvas.style('position', 'absolute');
                canvas.style('top', '0px');
                canvas.style('left', '0px');
                canvas.style('pointer-events', 'none');
                canvas.style('z-index', '10');
                p.noStroke();
                p.clear(); // 透明背景
                p.noLoop(); // 初期状態はループ停止
            };

            p.draw = () => {
                // isDrawingフラグでアニメーションを制御
                if (!this.isDrawing) {
                    return;
                }

                // 透明背景を維持
                p.clear();

                // 座標表示が有効な場合
                if (this.showCoordinates && this.particlePositions.length > 0) {
                    this.drawCoordinates(p);
                }
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

    // 座標表示を設定
    setShowCoordinates(show: boolean): void {
        this.showCoordinates = show;
        console.log(`[P5_VISUALIZER] Show coordinates: ${show}`);
    }

    // 色反転を設定
    setInvertColors(invert: boolean): void {
        this.invertColors = invert;
        console.log(`[P5_VISUALIZER] Invert colors: ${invert}`);
    }

    // パーティクル座標を更新
    updateParticlePositions(positions: Array<{ x: number, y: number, z: number }>): void {
        this.particlePositions = positions;
    }

    // 座標を描画
    private drawCoordinates(p: p5): void {
        const margin = 2;
        const lineHeight = 8;
        const fontSize = 8;
        const titleSize = 9;
        const titleHeight = 15;
        const columnSpacing = 1;

        // 画面全体を使用（背景は描画せず常に透明を維持）
        const boxX = margin;
        const boxY = margin;
        const boxWidth = p.width - margin * 2;
        const boxHeight = p.height - margin * 2;

        // テキスト色を決定（反転時は黒、通常時は白）
        if (this.invertColors) {
            p.fill(0);
        } else {
            p.fill(255);
        }
        p.noStroke();
        p.textAlign(p.LEFT, p.TOP);
        p.textFont('monospace');
        p.textSize(fontSize);

        // サンプルテキストで実際の幅を測定
        const sampleText = "999:(-99.99,-99.99,-99.99)";
        const textWidth = p.textWidth(sampleText);
        const columnWidth = textWidth + 2; // 実測幅 + 小さいマージン

        // タイトル
        p.textSize(titleSize);
        p.text(`Particles: ${this.particlePositions.length}`, boxX + 3, boxY + 3);

        // 列数を計算
        const numColumns = Math.floor((boxWidth - 6) / (columnWidth + columnSpacing));

        // 座標リスト
        p.textSize(fontSize);
        const availableHeight = boxHeight - titleHeight - 10;
        const rowsPerColumn = Math.floor(availableHeight / lineHeight);
        const maxVisible = numColumns * rowsPerColumn;
        const visiblePositions = this.particlePositions.slice(0, maxVisible);

        console.log(`[P5_VISUALIZER] Width: ${boxWidth}, textWidth: ${textWidth.toFixed(1)}, columnWidth: ${columnWidth.toFixed(1)}, Columns: ${numColumns}, Rows: ${rowsPerColumn}, Max visible: ${maxVisible}`);

        visiblePositions.forEach((pos, i) => {
            const columnIndex = Math.floor(i / rowsPerColumn);
            const rowIndex = i % rowsPerColumn;
            const x = boxX + 3 + columnIndex * (columnWidth + columnSpacing);
            const y = boxY + titleHeight + rowIndex * lineHeight;

            const text = `${String(i).padStart(3, ' ')}:(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)})`;
            p.text(text, x, y);
        });

        // スクロールインジケーター
        if (this.particlePositions.length > maxVisible) {
            p.textSize(7);
            p.fill(255, 255, 0);
            const indicatorText = `...${maxVisible}/${this.particlePositions.length}`;
            p.text(indicatorText, boxX + 3, boxY + boxHeight - 8);
        }
    }

    // クリーンアップ
    destroy() {
        if (this.p5Instance) {
            this.p5Instance.remove();
        }
    }
}
