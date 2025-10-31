import { ViewportCropConfig } from './viewportTypes';

const DEFAULT_CONFIG: ViewportCropConfig = {
    enabled: false,
    left: 0,
    top: 0,
    right: 1,
    bottom: 1,
    frameVisible: false,
    frameColor: 'rgba(255,255,255,0.65)',
    frameWidth: 4,
    scaleMode: 'contain',
    anchor: 'center'
};

function clamp01(value: number): number {
    if (Number.isNaN(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

const STORAGE_KEY = 'visualizer:viewport-crop-config';

export class ViewportCropper {
    private readonly container: HTMLElement;
    private readonly mask: HTMLElement;
    private readonly stage: HTMLElement;
    private readonly frame: HTMLElement;
    private config: ViewportCropConfig = { ...DEFAULT_CONFIG };
    private resizeObserver: ResizeObserver | null = null;

    constructor() {
        const container = document.getElementById('visualizer-container');
        const mask = document.getElementById('visualizer-crop-mask');
        const stage = document.getElementById('visualizer-stage');
        const frame = document.getElementById('visualizer-frame');

        if (!container || !mask || !stage || !frame) {
            throw new Error('[ViewportCropper] Required DOM elements not found');
        }

        this.container = container;
        this.mask = mask;
        this.stage = stage;
        this.frame = frame;

        this.loadStoredConfig();
        this.applyConfig(this.config, false);

        this.resizeObserver = new ResizeObserver(() => {
            this.applyConfig(this.config, false);
        });
        this.resizeObserver.observe(this.container);
        window.addEventListener('resize', this.handleResize);
    }

    public applyConfig(config: Partial<ViewportCropConfig>, persist: boolean = true): void {
        const merged: ViewportCropConfig = {
            ...this.config,
            ...config
        };

        const normalized = this.normalizeConfig(merged);
        this.config = normalized;

        this.updateStageDimensions();
        this.updateMask(normalized);
        this.updateStageTransform(normalized);
        this.updateFrame(normalized);

        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            } catch (error) {
                console.warn('[ViewportCropper] Failed to persist config:', error);
            }
        }
    }

    public getConfig(): ViewportCropConfig {
        return { ...this.config };
    }

    public destroy(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        window.removeEventListener('resize', this.handleResize);
    }

    private handleResize = () => {
        this.applyConfig(this.config, false);
    };

    private loadStoredConfig(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                this.config = { ...DEFAULT_CONFIG };
                return;
            }
            const parsed = JSON.parse(stored) as Partial<ViewportCropConfig> | undefined;
            if (parsed) {
                this.config = this.normalizeConfig({ ...DEFAULT_CONFIG, ...parsed });
            }
        } catch (error) {
            console.warn('[ViewportCropper] Failed to load stored config:', error);
            this.config = { ...DEFAULT_CONFIG };
        }
    }

    private normalizeConfig(config: ViewportCropConfig): ViewportCropConfig {
        let left = clamp01(config.left);
        let top = clamp01(config.top);
        let right = clamp01(config.right);
        let bottom = clamp01(config.bottom);

        if (right <= left) {
            right = Math.min(1, left + 0.05);
        }
        if (bottom <= top) {
            bottom = Math.min(1, top + 0.05);
        }

        const frameWidth = Number.isFinite(config.frameWidth) ? Math.max(0, config.frameWidth ?? 0) : DEFAULT_CONFIG.frameWidth;

        return {
            enabled: !!config.enabled,
            left,
            top,
            right,
            bottom,
            frameVisible: !!config.frameVisible,
            frameColor: config.frameColor ?? DEFAULT_CONFIG.frameColor,
            frameWidth,
            scaleMode: config.scaleMode ?? DEFAULT_CONFIG.scaleMode,
            anchor: config.anchor ?? DEFAULT_CONFIG.anchor
        };
    }

    private updateStageDimensions(): void {
        const rect = this.container.getBoundingClientRect();
        this.container.style.setProperty('--stage-width', `${rect.width}px`);
        this.container.style.setProperty('--stage-height', `${rect.height}px`);
    }

    private updateMask(config: ViewportCropConfig): void {
        if (!config.enabled) {
            this.mask.style.left = '0%';
            this.mask.style.top = '0%';
            this.mask.style.width = '100%';
            this.mask.style.height = '100%';
            this.mask.classList.remove('crop-enabled');
            return;
        }

        const widthPercent = (config.right - config.left) * 100;
        const heightPercent = (config.bottom - config.top) * 100;

        this.mask.style.left = `${config.left * 100}%`;
        this.mask.style.top = `${config.top * 100}%`;
        this.mask.style.width = `${widthPercent}%`;
        this.mask.style.height = `${heightPercent}%`;
        this.mask.classList.add('crop-enabled');
    }

    private updateStageTransform(config: ViewportCropConfig): void {
        const rect = this.container.getBoundingClientRect();
        const baseWidth = rect.width;
        const baseHeight = rect.height;

        if (!config.enabled) {
            this.stage.style.transform = 'translate(0px, 0px) scale(1)';
            return;
        }

        const viewportWidth = (config.right - config.left) * baseWidth;
        const viewportHeight = (config.bottom - config.top) * baseHeight;

        if (viewportWidth <= 0 || viewportHeight <= 0) {
            this.stage.style.transform = 'translate(0px, 0px) scale(1)';
            return;
        }

        const scaleMode = config.scaleMode ?? 'contain';
        let scale: number;
        if (scaleMode === 'cover') {
            scale = Math.max(viewportWidth / baseWidth, viewportHeight / baseHeight);
        } else {
            scale = Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight);
        }

        if (!Number.isFinite(scale) || scale <= 0) {
            scale = 1;
        }

        const scaledWidth = baseWidth * scale;
        const scaledHeight = baseHeight * scale;

        let offsetX = 0;
        let offsetY = 0;

        if (config.anchor === 'top-left') {
            offsetX = 0;
            offsetY = 0;
        } else {
            offsetX = (viewportWidth - scaledWidth) / 2;
            offsetY = (viewportHeight - scaledHeight) / 2;
        }

        this.stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    private updateFrame(config: ViewportCropConfig): void {
        if (!config.enabled || !config.frameVisible) {
            this.frame.style.display = 'none';
            return;
        }

        this.frame.style.display = 'block';
        const frameColor: string = config.frameColor ?? DEFAULT_CONFIG.frameColor ?? 'rgba(255,255,255,0.65)';
        const frameWidth: number = config.frameWidth ?? DEFAULT_CONFIG.frameWidth ?? 4;
        this.frame.style.borderColor = frameColor;
        this.frame.style.borderWidth = `${frameWidth}px`;
    }
}
