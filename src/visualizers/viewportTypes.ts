export type ViewportAnchor = 'center' | 'top-left';

export type ViewportScaleMode = 'contain' | 'cover';

export interface ViewportCropConfig {
    enabled: boolean;
    left: number; // 0.0 - 1.0, inclusive
    top: number; // 0.0 - 1.0, inclusive
    right: number; // 0.0 - 1.0, inclusive
    bottom: number; // 0.0 - 1.0, inclusive
    frameVisible?: boolean;
    frameColor?: string;
    frameWidth?: number;
    scaleMode?: ViewportScaleMode;
    anchor?: ViewportAnchor;
}

export interface ViewportCropCommand {
    type: 'set-viewport-crop';
    config: ViewportCropConfig;
}
