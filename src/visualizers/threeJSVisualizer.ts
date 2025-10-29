import * as THREE from "three";
import { ParticleSystem } from "./scenes/particleSystem";

// グローバル型定義
declare global {
    interface Window {
        threeScene?: THREE.Scene;
        threeRenderer?: THREE.WebGLRenderer;
        threeCamera?: THREE.PerspectiveCamera;
    }
}

export class ThreeJSVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private cube: THREE.Mesh;
    private animationId: number | null = null;
    private particleSystem: ParticleSystem | null = null;
    private lastFrameTime: number = 0;

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

        // リサイズハンドラーはVisualSyncManagerで管理するためコメントアウト
        // this.setupResizeHandler();

        // 初期レンダリングを実行（黒画面を表示）
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.render(this.scene, this.camera);

        console.log("[THREE_VISUALIZER] Three.js initialized");
        console.log('[THREE_VISUALIZER] Initial black render complete');
    }

    // アニメーションを開始
    startAnimation() {
        if (this.animationId) return; // 既に実行中の場合は何もしない

        // 立方体は非表示のまま（パーティクルのみ表示）
        this.cube.visible = false;

        // 透明背景に戻す
        this.renderer.setClearColor(0x000000, 0);

        // パーティクルシステムを初期化（最初の1回のみ）
        if (!this.particleSystem) {
            this.particleSystem = new ParticleSystem({
                count: 1000, // 初期値
                rangeX: [-3, 3],   // 画面内に収まる範囲に縮小
                rangeY: [-2, 2],   // 画面内に収まる範囲に縮小
                rangeZ: [-2, 2],   // 奥行きも縮小
                speedMin: 0.01,    // 速度を大幅に低減
                speedMax: 0.05,
                size: 4,           // サイズをさらに大きく
                color: 0xffffff,   // 白色に変更
                opacity: 1.0       // 完全不透明
            });
            this.scene.add(this.particleSystem.getPoints());
            console.log('[THREE_VISUALIZER] Particle system initialized');
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
                this.particleSystem.update(deltaTime);
            }

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

    // 現在のFPSを取得
    getParticleFPS(): number {
        return this.particleSystem?.getFPS() ?? 0;
    }

    // 現在のパーティクル数を取得
    getCurrentParticleCount(): number {
        return this.particleSystem?.getParticleCount() ?? 0;
    }

    // シーンにオブジェクトを追加
    addToScene(object: THREE.Object3D) {
        this.scene.add(object);
    }

    // シーンからオブジェクトを削除
    removeFromScene(object: THREE.Object3D) {
        this.scene.remove(object);
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

    // クリーンアップ
    destroy() {
        this.stopAnimation();
        this.renderer.dispose();

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
