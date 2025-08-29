// 音響的オートマトン - 映像システム（第1部）
// 3分割画面とフラッシュエフェクト、軸線表示

export interface VisualConfig {
    canvasWidth: number;
    canvasHeight: number;
    flashDuration: number; // ms
    axisDecayTime: number; // ms
    instrumentColors: {
        horn1: string;
        horn2: string;
        trombone: string;
    };
    axisColor: string;
    backgroundColor: string;
}

export interface FlashInstance {
    id: string;
    section: number; // 0, 1, 2 (3分割)
    startTime: number;
    opacity: number;
    color: string;
}

export interface AxisInstance {
    id: string;
    startTime: number;
    opacity: number;
    isElectronic: boolean; // 電子音の場合true
}

export class AcousticAutomatonVisuals {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: VisualConfig;
    private animationId: number | null = null;

    // エフェクト管理
    private flashInstances: Map<string, FlashInstance> = new Map();
    private axisInstances: Map<string, AxisInstance> = new Map();

    // 楽器とセクションのマッピング
    private instrumentSections = {
        'horn1': 0,
        'horn2': 1,
        'trombone': 2
    };

    // イベントハンドラーの参照を保持
    private boundEventHandler: (event: Event) => void;

    constructor(canvas: HTMLCanvasElement, config: VisualConfig) {
        this.canvas = canvas;
        this.config = config;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Cannot get 2D context from canvas');
        }
        this.ctx = ctx;

        // キャンバスサイズ設定
        this.setupCanvas();

        // イベントハンドラーをバインド
        this.boundEventHandler = (event: Event) => {
            this.handlePerformanceEvent(event as CustomEvent);
        };

        // パフォーマンスイベントを監視
        document.addEventListener('performance-event', this.boundEventHandler);

        // アニメーションループ開始
        this.startAnimation();

        console.log('[Visuals] Visual system initialized');
    }

    private setupCanvas(): void {
        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;
        this.canvas.style.width = `${this.config.canvasWidth}px`;
        this.canvas.style.height = `${this.config.canvasHeight}px`;

        // 高DPI対応
        const devicePixelRatio = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * devicePixelRatio;
        this.canvas.height = rect.height * devicePixelRatio;
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    private handlePerformanceEvent(event: CustomEvent): void {
        const { type, data } = event.detail;

        switch (type) {
            case 'acoustic_trigger':
                this.triggerInstrumentFlash(data.instrumentId, data.instanceId);
                this.triggerAxisLine(data.instanceId, false);
                break;

            case 'electronic_trigger':
                this.triggerAxisLine(data.instanceId, true);
                break;
        }
    }

    /**
     * 楽器フラッシュの開始
     */
    private triggerInstrumentFlash(instrumentId: string, instanceId: string): void {
        const section = this.instrumentSections[instrumentId as keyof typeof this.instrumentSections];
        if (section === undefined) return;

        const flash: FlashInstance = {
            id: `flash_${instanceId}`,
            section,
            startTime: performance.now(),
            opacity: 1.0,
            color: this.config.instrumentColors[instrumentId as keyof typeof this.config.instrumentColors]
        };

        this.flashInstances.set(flash.id, flash);

        console.log(`[Visuals] Flash triggered for ${instrumentId} in section ${section}`);
    }

    /**
     * 軸線の開始
     */
    private triggerAxisLine(instanceId: string, isElectronic: boolean): void {
        const axis: AxisInstance = {
            id: `axis_${instanceId}`,
            startTime: performance.now(),
            opacity: 1.0,
            isElectronic
        };

        this.axisInstances.set(axis.id, axis);

        console.log(`[Visuals] Axis line triggered for ${instanceId} (electronic: ${isElectronic})`);
    }

    /**
     * アニメーションループ
     */
    private startAnimation(): void {
        const animate = () => {
            this.render();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * フレーム描画
     */
    private render(): void {
        const currentTime = performance.now();

        // 背景クリア
        this.ctx.fillStyle = this.config.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 3分割の境界線を描画
        this.drawSectionBorders();

        // フラッシュエフェクトを描画
        this.renderFlashes(currentTime);

        // 軸線を描画
        this.renderAxisLines(currentTime);

        // 期限切れのインスタンスをクリーンアップ
        this.cleanupExpiredInstances(currentTime);
    }

    /**
     * セクション境界線の描画
     */
    private drawSectionBorders(): void {
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 2;

        const sectionWidth = this.canvas.width / 3;

        // 縦の境界線
        this.ctx.beginPath();
        this.ctx.moveTo(sectionWidth, 0);
        this.ctx.lineTo(sectionWidth, this.canvas.height);
        this.ctx.moveTo(sectionWidth * 2, 0);
        this.ctx.lineTo(sectionWidth * 2, this.canvas.height);
        this.ctx.stroke();
    }

    /**
     * フラッシュエフェクトの描画
     */
    private renderFlashes(currentTime: number): void {
        const sectionWidth = this.canvas.width / 3;

        this.flashInstances.forEach((flash) => {
            const elapsed = currentTime - flash.startTime;
            const progress = elapsed / this.config.flashDuration;

            if (progress >= 1.0) return; // 期限切れ（cleanupで削除される）

            // 指数関数的減衰
            const opacity = Math.exp(-progress * 3) * flash.opacity;

            // セクションの描画
            const x = flash.section * sectionWidth;
            const y = 0;
            const width = sectionWidth;
            const height = this.canvas.height;

            // グラデーション作成
            const gradient = this.ctx.createRadialGradient(
                x + width / 2, y + height / 2, 0,
                x + width / 2, y + height / 2, Math.max(width, height) / 2
            );
            gradient.addColorStop(0, this.hexToRgba(flash.color, opacity));
            gradient.addColorStop(1, this.hexToRgba(flash.color, 0));

            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, width, height);
        });
    }

    /**
     * 軸線の描画
     */
    private renderAxisLines(currentTime: number): void {
        this.axisInstances.forEach((axis) => {
            const elapsed = currentTime - axis.startTime;
            const progress = elapsed / this.config.axisDecayTime;

            if (progress >= 1.0) return; // 期限切れ

            // 指数関数的減衰
            const opacity = Math.exp(-progress * 2) * axis.opacity;

            // 軸線の描画（画面中央の縦線）
            const centerX = this.canvas.width / 2;
            const lineWidth = axis.isElectronic ? 4 : 2; // 電子音は太い線

            this.ctx.strokeStyle = this.hexToRgba(this.config.axisColor, opacity);
            this.ctx.lineWidth = lineWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, 0);
            this.ctx.lineTo(centerX, this.canvas.height);
            this.ctx.stroke();

            // 電子音の場合、追加のエフェクト
            if (axis.isElectronic) {
                this.ctx.strokeStyle = this.hexToRgba('#ffffff', opacity * 0.5);
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        });
    }

    /**
     * 期限切れインスタンスのクリーンアップ
     */
    private cleanupExpiredInstances(currentTime: number): void {
        // フラッシュインスタンス
        this.flashInstances.forEach((flash, id) => {
            const elapsed = currentTime - flash.startTime;
            if (elapsed >= this.config.flashDuration) {
                this.flashInstances.delete(id);
            }
        });

        // 軸線インスタンス
        this.axisInstances.forEach((axis, id) => {
            const elapsed = currentTime - axis.startTime;
            if (elapsed >= this.config.axisDecayTime) {
                this.axisInstances.delete(id);
            }
        });
    }

    /**
     * 16進カラーをRGBAに変換
     */
    private hexToRgba(hex: string, alpha: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * リサイズ処理
     */
    resize(width: number, height: number): void {
        this.config.canvasWidth = width;
        this.config.canvasHeight = height;
        this.setupCanvas();
    }

    /**
     * 映像システムの停止
     */
    dispose(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        document.removeEventListener('performance-event', this.boundEventHandler);

        this.flashInstances.clear();
        this.axisInstances.clear();

        console.log('[Visuals] Visual system disposed');
    }
}

// デフォルト設定
export const defaultVisualConfig: VisualConfig = {
    canvasWidth: 1920,
    canvasHeight: 1080,
    flashDuration: 2000, // 2秒
    axisDecayTime: 3000, // 3秒
    instrumentColors: {
        horn1: '#ff6b6b',    // 赤系
        horn2: '#4ecdc4',    // 青緑系
        trombone: '#45b7d1'  // 青系
    },
    axisColor: '#ffffff',
    backgroundColor: '#000000'
};
