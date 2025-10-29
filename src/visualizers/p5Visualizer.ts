import p5 from "p5";
import { resumeAudio } from "../audio/audioCore";

export interface ParticleDisplayData {
    x: number;
    y: number;
    z: number;
    screenX: number;
    screenY: number;
    isVisible: boolean;
}

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
    private coordinateDisplayMode: 'panel' | 'inline' = 'panel';
    private particleData: ParticleDisplayData[] = []; // パーティクル表示用データ
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

                if (!this.showCoordinates || this.particleData.length === 0) {
                    return;
                }

                if (this.coordinateDisplayMode === 'inline') {
                    this.drawInlineCoordinates(p);
                } else {
                    this.drawPanelCoordinates(p);
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

    // 座標表示モードを設定
    setCoordinateDisplayMode(mode: 'panel' | 'inline'): void {
        this.coordinateDisplayMode = mode;
        console.log(`[P5_VISUALIZER] Coordinate display mode: ${mode}`);
    }

    // 現在の座標表示状態を取得
    isCoordinatesVisible(): boolean {
        return this.showCoordinates;
    }

    // 色反転を設定
    setInvertColors(invert: boolean): void {
        this.invertColors = invert;
        console.log(`[P5_VISUALIZER] Invert colors: ${invert}`);
    }

    // パーティクル描画データを更新
    updateParticleData(data: ParticleDisplayData[]): void {
        this.particleData = data;
    }

    // 座標（リストパネル）を描画
    private drawPanelCoordinates(p: p5): void {
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
        p.text(`Particles: ${this.particleData.length}`, boxX + 3, boxY + 3);

        // 列数を計算
        const numColumns = Math.floor((boxWidth - 6) / (columnWidth + columnSpacing));

        // 座標リスト
        p.textSize(fontSize);
        const availableHeight = boxHeight - titleHeight - 10;
        const rowsPerColumn = Math.floor(availableHeight / lineHeight);
        const maxVisible = numColumns * rowsPerColumn;
        const visiblePositions = this.particleData.slice(0, maxVisible);

        visiblePositions.forEach((pos: ParticleDisplayData, i: number) => {
            const columnIndex = Math.floor(i / rowsPerColumn);
            const rowIndex = i % rowsPerColumn;
            const x = boxX + 3 + columnIndex * (columnWidth + columnSpacing);
            const y = boxY + titleHeight + rowIndex * lineHeight;

            const text = `${String(i).padStart(3, ' ')}:(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)})`;
            p.text(text, x, y);
        });

        // スクロールインジケーター
        if (this.particleData.length > maxVisible) {
            p.textSize(7);
            p.fill(255, 255, 0);
            const indicatorText = `...${maxVisible}/${this.particleData.length}`;
            p.text(indicatorText, boxX + 3, boxY + boxHeight - 8);
        }
    }

    // 座標（インライン）を描画
    private drawInlineCoordinates(p: p5): void {
        const textColor = this.invertColors ? 0 : 255;
        p.fill(textColor);
        p.noStroke();
        p.textAlign(p.LEFT, p.CENTER);
        p.textFont('monospace');
        p.textSize(8);

        const padding = 4;
        const margin = 2;
        const maxWidth = p.width - margin;

        this.particleData.forEach((particle: ParticleDisplayData) => {
            if (!particle.isVisible || Number.isNaN(particle.screenX) || Number.isNaN(particle.screenY)) {
                return;
            }

            const text = `(${particle.x.toFixed(2)},${particle.y.toFixed(2)},${particle.z.toFixed(2)})`;
            const textWidth = p.textWidth(text);

            let drawX = particle.screenX + padding;
            if (drawX + textWidth > maxWidth) {
                drawX = Math.max(margin, maxWidth - textWidth);
            }

            const drawY = particle.screenY;
            if (drawY < margin || drawY > p.height - margin) {
                return;
            }

            p.text(text, drawX, drawY);
        });
    }

    // クリーンアップ
    destroy() {
        if (this.p5Instance) {
            this.p5Instance.remove();
        }
    }
}
