import * as THREE from "three";
import { ParticleSystem, ParticleAudioSnapshot } from "./scenes/particleSystem";
import { P5Visualizer, ParticleDisplayData } from "./p5Visualizer";

interface TriggerPulseOptions {
    performerId?: string;
    color?: number;
    intensity?: number;
    decaySeconds?: number;
    sourceDurationSeconds?: number;
    attractionMultiplier?: number;
    jitter?: number;
    screenPulseStrength?: number;
    screenPulseDuration?: number;
}

// グローバル型定義
declare global {
    interface Window {
        threeScene?: THREE.Scene;
        threeRenderer?: THREE.WebGLRenderer;
        threeCamera?: THREE.PerspectiveCamera;
        threeVisualizer?: ThreeJSVisualizer;
    }
}

export class ThreeJSVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private cube: THREE.Mesh;
    private animationId: number | null = null;
    private particleSystem: ParticleSystem | null = null;
    private particlePoints: THREE.Points | null = null;
    private pulsePoints: THREE.Points | null = null;
    private lastFrameTime: number = 0;
    private p5Visualizer: P5Visualizer | null = null; // p5Visualizerへの参照
    private coordinateDisplayMode: 'panel' | 'inline' = 'panel';
    private projectionVector: THREE.Vector3 = new THREE.Vector3();
    private pulseOverlayEl: HTMLElement | null = null;
    private screenPulseValue = 0;
    private screenPulseDecayRate = 1;
    private baseSceneEnabled = false;
    private pulseEffectsEnabled = false;
    private axesHelper: THREE.Object3D | null = null;
    private particleAudioChannel: BroadcastChannel | null = null;
    private lastParticleAudioBroadcast = 0;
    private readonly particleAudioBroadcastIntervalMs = 75;
    private readonly maxTrackedParticlesForAudio = 48;

    constructor(canvas?: HTMLCanvasElement) {
        // シーン、カメラ、レンダラーの初期化
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // canvas要素を取得してレンダラーを初期化
        const targetCanvas = canvas || document.getElementById('three-canvas') as HTMLCanvasElement;
        this.renderer = new THREE.WebGLRenderer({
            canvas: targetCanvas,
            alpha: true // 透明背景を有効にする
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0); // 透明背景

        const rendererCanvas = this.renderer.domElement;
        rendererCanvas.style.position = 'absolute';
        rendererCanvas.style.top = '0px';
        rendererCanvas.style.left = '0px';
        rendererCanvas.style.zIndex = '1';
        rendererCanvas.style.display = 'block';

        this.pulseOverlayEl = document.getElementById('pulse-overlay');
        this.resetScreenPulseOverlay();
        if (this.pulseOverlayEl) {
            this.pulseOverlayEl.style.backgroundColor = 'rgba(255,255,255,1)';
        }

        // 基本的なジオメトリとマテリアルを作成
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        this.cube = new THREE.Mesh(geometry, material);
        this.cube.visible = false; // 初期状態では非表示
        this.scene.add(this.cube);

        this.camera.position.z = 5;

        // グローバルに保存
        window.threeScene = this.scene;
        window.threeRenderer = this.renderer;
        window.threeCamera = this.camera;
        window.threeVisualizer = this;

        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.particleAudioChannel = new BroadcastChannel('performance-control');
            } catch (error) {
                console.error('[THREE_VISUALIZER] Failed to open particle audio channel', error);
            }
        }

        // リサイズハンドラーはVisualSyncManagerで管理するためコメントアウト
        // this.setupResizeHandler();

        // 初期レンダリングを実行（黒画面を表示）
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.render(this.scene, this.camera);

        console.log("[THREE_VISUALIZER] Three.js initialized");
        console.log('[THREE_VISUALIZER] Initial black render complete');
        console.log('[THREE_VISUALIZER] Base particle scene and pulse effects are disabled by default.');
    }

    // アニメーションを開始
    startAnimation() {
        if (this.animationId) return; // 既に実行中の場合は何もしない

        if (!this.baseSceneEnabled && !this.pulseEffectsEnabled) {
            this.cube.visible = false;
            this.renderer.setClearColor(0x000000, 1);
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            this.resetScreenPulseOverlay();
            return;
        }

        // 立方体は非表示のまま（パーティクルのみ表示）
        this.cube.visible = false;

        // 背景の透明度はベースシーンの状態に合わせる
        this.renderer.setClearColor(0x000000, this.baseSceneEnabled ? 0 : 1);

        // パーティクルシステムを初期化（最初の1回のみ）
        this.ensureParticleSystem();

        if (this.particlePoints) {
            this.particlePoints.visible = this.baseSceneEnabled;
        }
        if (this.pulsePoints) {
            this.pulsePoints.visible = this.pulseEffectsEnabled;
        }

        this.lastFrameTime = performance.now();

        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            // デルタタイム計算
            const currentTime = performance.now();
            const deltaTime = (currentTime - this.lastFrameTime) / 1000; // 秒単位
            this.lastFrameTime = currentTime;

            // パーティクルシステムを更新
            if (this.particleSystem) {
                this.particleSystem.update(deltaTime, this.baseSceneEnabled);

                // p5Visualizerに座標を送信（座標表示が有効な場合）
                if (this.baseSceneEnabled && this.p5Visualizer && this.p5Visualizer.isCoordinatesVisible()) {
                    const particleData = this.buildParticleDisplayData();
                    this.p5Visualizer.updateParticleData(particleData);
                }

                this.broadcastParticleAudioSnapshot();
            }

            this.updateScreenPulse(deltaTime);
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    // アニメーションを停止
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // 手動でリサイズ（VisualSyncManagerから呼ばれる）
    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        console.log(`[THREE_VISUALIZER] Renderer resized to ${width}x${height}`);
    }

    // パーティクル数を変更
    setParticleCount(count: number) {
        if (this.particleSystem) {
            this.particleSystem.setParticleCount(count);
            console.log(`[THREE_VISUALIZER] Particle count changed to ${count}`);
        } else {
            console.warn('[THREE_VISUALIZER] Particle system not initialized yet');
        }
    }

    // パーティクル色を変更
    setParticleColor(color: number) {
        if (this.particleSystem) {
            this.particleSystem.setColor(color);
        }
    }

    // パーティクルサイズを変更
    setParticleSize(size: number) {
        if (this.particleSystem) {
            this.particleSystem.setSize(size);
        }
    }

    // ベースとなるパーティクルシーンの有効/無効を切り替え
    setBaseSceneEnabled(enabled: boolean) {
        if (this.baseSceneEnabled === enabled) {
            return;
        }

        this.baseSceneEnabled = enabled;

        if (!enabled) {
            this.renderer.setClearColor(0x000000, 1);
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            if (this.particlePoints) {
                this.particlePoints.visible = false;
            }
            if (!this.pulseEffectsEnabled) {
                this.stopAnimation();
                this.teardownParticleSystem();
            }
            console.log('[THREE_VISUALIZER] Base scene disabled');
        } else {
            this.ensureParticleSystem();
            if (this.particlePoints) {
                this.particlePoints.visible = true;
            }
            if (!this.animationId) {
                this.startAnimation();
            }
            console.log('[THREE_VISUALIZER] Base scene enabled');
        }
    }

    // パルスなどの演出を有効/無効に切り替え
    setPulseEffectsEnabled(enabled: boolean) {
        if (this.pulseEffectsEnabled === enabled) {
            return;
        }

        this.pulseEffectsEnabled = enabled;

        if (!enabled) {
            this.resetScreenPulseOverlay();
            if (this.pulsePoints) {
                this.pulsePoints.visible = false;
            }
            if (!this.baseSceneEnabled) {
                this.stopAnimation();
                this.teardownParticleSystem();
                this.renderer.setClearColor(0x000000, 1);
                this.renderer.clear();
                this.renderer.render(this.scene, this.camera);
            }
        }
        else {
            this.ensureParticleSystem();
            if (this.pulsePoints) {
                this.pulsePoints.visible = true;
            }
            if (!this.animationId) {
                this.startAnimation();
            }
        }

        console.log(`[THREE_VISUALIZER] Pulse effects ${enabled ? 'enabled' : 'disabled'}`);
    }

    // 現在のFPSを取得
    getParticleFPS(): number {
        return this.particleSystem?.getFPS() ?? 0;
    }

    // 現在のパーティクル数を取得
    getCurrentParticleCount(): number {
        return this.particleSystem?.getParticleCount() ?? 0;
    }

    // p5Visualizerへの参照を設定
    setP5Visualizer(p5Visualizer: P5Visualizer) {
        this.p5Visualizer = p5Visualizer;
        this.p5Visualizer.setCoordinateDisplayMode(this.coordinateDisplayMode);
        console.log('[THREE_VISUALIZER] P5Visualizer reference set');
    }

    // 座標表示を制御
    setShowCoordinates(show: boolean) {
        if (this.p5Visualizer) {
            this.p5Visualizer.setShowCoordinates(show);
            if (show) {
                const particleData = this.buildParticleDisplayData();
                this.p5Visualizer.updateParticleData(particleData);
            }
            console.log(`[THREE_VISUALIZER] Show coordinates: ${show}`);
        }
    }

    // 座標表示モードを設定
    setCoordinateDisplayMode(mode: 'panel' | 'inline') {
        this.coordinateDisplayMode = mode;
        if (this.p5Visualizer) {
            this.p5Visualizer.setCoordinateDisplayMode(mode);
            if (this.p5Visualizer.isCoordinatesVisible()) {
                const particleData = this.buildParticleDisplayData();
                this.p5Visualizer.updateParticleData(particleData);
            }
        }
        console.log(`[THREE_VISUALIZER] Coordinate display mode: ${mode}`);
    }

    // 引力強度を設定
    setAttractionStrength(multiplier: number) {
        if (this.particleSystem) {
            this.particleSystem.setAttractionMultiplier(multiplier);
            console.log(`[THREE_VISUALIZER] Attraction strength: ${multiplier.toFixed(2)}x`);
        }
    }

    public triggerPerformerPulse(options: TriggerPulseOptions = {}) {
        if (!this.pulseEffectsEnabled) {
            return;
        }

        this.ensureParticleSystem();
        if (!this.animationId) {
            this.startAnimation();
        }

        const color = options.color ?? 0xffffff;
        const baseIntensity = Math.max(0.1, options.intensity ?? 1.0);
        const decaySeconds = Math.max(0.3, options.decaySeconds ?? 1.0);
        const attractionMultiplier = Math.max(1, options.attractionMultiplier ?? 3.2);
        const sourceDuration = Math.max(0, options.sourceDurationSeconds ?? options.decaySeconds ?? 1);
        const durationNorm = Math.min(1, sourceDuration / 2.5);
        const durationAttenuation = 0.5 + durationNorm * 0.7; // stronger flashes while keeping duration influence
        const boostedIntensity = baseIntensity * durationAttenuation * 1.35;
        const visualIntensity = Math.min(2.4, boostedIntensity);
        const jitter = options.jitter ?? 0.02;

        if (this.particleSystem) {
            this.particleSystem.spawnPulseParticle({
                color,
                intensity: visualIntensity,
                decaySeconds,
                attractionMultiplier: attractionMultiplier * (0.5 + durationNorm * 0.5),
                jitter
            });
        }

        const screenPulseStrength = Math.min(0.75, options.screenPulseStrength ?? (0.2 + visualIntensity * 0.24));
        const screenPulseDuration = Math.max(0.25, options.screenPulseDuration ?? (0.6 + durationNorm * 0.45));
        this.triggerScreenPulse(screenPulseStrength, screenPulseDuration);
    }

    private triggerScreenPulse(strength: number, duration: number) {
        if (!this.pulseEffectsEnabled || !this.pulseOverlayEl) {
            return;
        }

        const clampedStrength = Math.max(0, Math.min(strength, 0.8));
        const resolvedDuration = Math.max(0.05, duration);
        const nextValue = Math.max(this.screenPulseValue, clampedStrength);

        this.screenPulseValue = nextValue;
        this.screenPulseDecayRate = nextValue / resolvedDuration;
        this.pulseOverlayEl.style.opacity = this.screenPulseValue.toFixed(3);
    }

    private updateScreenPulse(deltaTime: number) {
        if (!this.pulseEffectsEnabled || !this.pulseOverlayEl) {
            this.resetScreenPulseOverlay();
            return;
        }

        if (this.screenPulseValue <= 0) {
            if (this.pulseOverlayEl.style.opacity !== '0') {
                this.pulseOverlayEl.style.opacity = '0';
            }
            return;
        }

        this.screenPulseValue = Math.max(0, this.screenPulseValue - this.screenPulseDecayRate * deltaTime);
        if (this.screenPulseValue <= 0.001) {
            this.screenPulseValue = 0;
            this.pulseOverlayEl.style.opacity = '0';
        } else {
            this.pulseOverlayEl.style.opacity = this.screenPulseValue.toFixed(3);
        }
    }

    // パーティクル表示データを生成
    private buildParticleDisplayData(): ParticleDisplayData[] {
        if (!this.particleSystem) {
            return [];
        }

        const positions = this.particleSystem.getAllPositions();

        if (this.coordinateDisplayMode !== 'inline') {
            return positions.map((pos) => ({
                x: pos.x,
                y: pos.y,
                z: pos.z,
                screenX: 0,
                screenY: 0,
                isVisible: false
            }));
        }

        const domElement = this.renderer.domElement;
        const width = domElement.clientWidth || window.innerWidth;
        const height = domElement.clientHeight || window.innerHeight;

        return positions.map((pos) => {
            this.projectionVector.set(pos.x, pos.y, pos.z);
            this.projectionVector.project(this.camera);

            const screenX = (this.projectionVector.x * 0.5 + 0.5) * width;
            const screenY = (-this.projectionVector.y * 0.5 + 0.5) * height;
            const inFrustum = this.projectionVector.z >= -1 && this.projectionVector.z <= 1;
            const onScreen = screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;
            const isVisible = inFrustum && onScreen;

            return {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                screenX,
                screenY,
                isVisible
            };
        });
    }

    // 色反転を設定
    setInvertColors(invert: boolean) {
        if (!this.baseSceneEnabled) {
            this.renderer.setClearColor(invert ? 0xffffff : 0x000000, 1);
        } else if (invert) {
            this.renderer.setClearColor(0xffffff, 1); // 背景を白に
            if (this.particleSystem) {
                this.particleSystem.setParticleColor(0x000000); // パーティクルを黒に
            }
        } else {
            this.renderer.setClearColor(0x000000, 1); // 背景を黒に
            if (this.particleSystem) {
                this.particleSystem.setParticleColor(0xffffff); // パーティクルを白に
            }
        }

        // P5Visualizerにも色反転を伝達
        if (this.p5Visualizer) {
            this.p5Visualizer.setInvertColors(invert);
        }

        console.log(`[THREE_VISUALIZER] Invert colors: ${invert}`);
    }

    // シーンにオブジェクトを追加
    addToScene(object: THREE.Object3D) {
        this.scene.add(object);
    }

    // シーンからオブジェクトを削除
    removeFromScene(object: THREE.Object3D) {
        this.scene.remove(object);
    }

    // 座標軸を表示
    showAxes(show: boolean) {
        if (show && !this.axesHelper) {
            const axesGroup = new THREE.Group();

            const createAxisLine = (start: THREE.Vector3, end: THREE.Vector3, color: number) => {
                const geometry = new THREE.BufferGeometry();
                geometry.setFromPoints([start, end]);
                const material = new THREE.LineBasicMaterial({ color });
                return new THREE.Line(geometry, material);
            };

            axesGroup.add(
                createAxisLine(
                    new THREE.Vector3(-2, 0, 0),
                    new THREE.Vector3(2, 0, 0),
                    0xff4444
                )
            );
            axesGroup.add(
                createAxisLine(
                    new THREE.Vector3(0, -2, 0),
                    new THREE.Vector3(0, 2, 0),
                    0x44ff44
                )
            );
            axesGroup.add(
                createAxisLine(
                    new THREE.Vector3(0, 0, -2),
                    new THREE.Vector3(0, 0, 2),
                    0x4488ff
                )
            );

            this.scene.add(axesGroup);
            this.axesHelper = axesGroup;
            console.log('[THREE_VISUALIZER] Custom axes helper added (range: -2 to 2)');
        } else if (!show && this.axesHelper) {
            this.axesHelper.traverse((child) => {
                if (child instanceof THREE.Line) {
                    child.geometry.dispose();
                    const material = child.material as
                        | THREE.Material
                        | THREE.Material[]
                        | undefined;
                    if (material) {
                        if (Array.isArray(material)) {
                            material.forEach((mat) => mat.dispose());
                        } else if (typeof material.dispose === 'function') {
                            material.dispose();
                        }
                    }
                }
            });

            this.scene.remove(this.axesHelper);
            this.axesHelper = null;
            console.log('[THREE_VISUALIZER] Axes helper removed');
        }
    }

    // カメラの位置を設定
    setCameraPosition(x: number, y: number, z: number) {
        this.camera.position.set(x, y, z);
    }

    // キューブの色を変更
    setCubeColor(color: number) {
        if (this.cube.material instanceof THREE.MeshBasicMaterial) {
            this.cube.material.color.setHex(color);
        }
    }

    private ensureParticleSystem() {
        if (this.particleSystem) {
            return;
        }

        this.particleSystem = new ParticleSystem({
            count: 1000,
            rangeX: [-3, 3],
            rangeY: [-2, 2],
            rangeZ: [-2, 2],
            speedMin: 0.002,
            speedMax: 0.008,
            size: 2.3,
            color: 0xffffff,
            opacity: 1.0
        });

        const particlePoints = this.particleSystem.getPoints();
        particlePoints.visible = this.baseSceneEnabled;
        this.particlePoints = particlePoints;
        this.scene.add(particlePoints);

        const pulsePoints = this.particleSystem.getPulsePoints();
        if (pulsePoints) {
            pulsePoints.renderOrder = 2;
            pulsePoints.visible = this.pulseEffectsEnabled;
            this.scene.add(pulsePoints);
            this.pulsePoints = pulsePoints;
        }

        console.log('[THREE_VISUALIZER] Particle system initialized');
    }

    private teardownParticleSystem() {
        if (!this.particleSystem) {
            return;
        }

        if (this.particlePoints) {
            this.scene.remove(this.particlePoints);
        } else {
            this.scene.remove(this.particleSystem.getPoints());
        }

        const pulsePoints = this.pulsePoints ?? this.particleSystem.getPulsePoints();
        if (pulsePoints) {
            this.scene.remove(pulsePoints);
        }

        this.particleSystem.dispose();
        this.particleSystem = null;
        this.particlePoints = null;
        this.pulsePoints = null;
    }

    private broadcastParticleAudioSnapshot(): void {
        if (!this.particleAudioChannel || !this.particleSystem) {
            return;
        }

        const now = performance.now();
        if (now - this.lastParticleAudioBroadcast < this.particleAudioBroadcastIntervalMs) {
            return;
        }

        this.lastParticleAudioBroadcast = now;

        let snapshot: ParticleAudioSnapshot | null = null;
        try {
            snapshot = this.particleSystem.getAudioSnapshot(this.maxTrackedParticlesForAudio);
        } catch (error) {
            console.error('[THREE_VISUALIZER] Failed to build particle audio snapshot', error);
            return;
        }

        if (!snapshot) {
            return;
        }

        try {
            this.particleAudioChannel.postMessage({
                type: 'particle-state',
                timestamp: Date.now(),
                snapshot,
            });
        } catch (error) {
            console.error('[THREE_VISUALIZER] Failed to post particle audio snapshot', error);
        }
    }

    private resetScreenPulseOverlay() {
        this.screenPulseValue = 0;
        this.screenPulseDecayRate = 1;

        if (this.pulseOverlayEl) {
            this.pulseOverlayEl.style.opacity = '0';
        }
    }

    // 黒画面にクリア
    clearToBlack(): void {
        // アニメーションを停止
        this.stopAnimation();

        // 立方体を非表示
        this.cube.visible = false;

        // 黒背景でレンダリング
        this.renderer.setClearColor(0x000000, 1); // 不透明な黒
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.resetScreenPulseOverlay();

        console.log('[THREE_VISUALIZER] Cleared to black');
    }

    // レンダラーを取得
    getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }

    // シーンを取得
    getScene(): THREE.Scene {
        return this.scene;
    }

    // カメラを取得
    getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    // ビジュアルを初期状態にリセット
    resetToInitialState(): void {
        this.setPulseEffectsEnabled(false);
        this.setBaseSceneEnabled(false);
        console.log('[THREE_VISUALIZER] Reset to initial visual state');
    }

    // クリーンアップ
    destroy() {
        this.stopAnimation();
        this.teardownParticleSystem();
        this.renderer.dispose();

        if (this.particleAudioChannel) {
            try {
                this.particleAudioChannel.close();
            } catch (error) {
                console.error('[THREE_VISUALIZER] Failed to close particle audio channel', error);
            }
            this.particleAudioChannel = null;
        }

        // シーン内のオブジェクトをクリーンアップ
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }
}
