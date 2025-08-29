import * as THREE from "three";

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
    private currentMode: 'normal' | 'test' | 'section' = 'normal';
    private sectionNumber: number = 0;

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
        this.scene.add(this.cube);

        this.camera.position.z = 5;

        // グローバルに保存
        window.threeScene = this.scene;
        window.threeRenderer = this.renderer;
        window.threeCamera = this.camera;

        this.setupResizeHandler();

        console.log("[THREE_VISUALIZER] Three.js initialized");
    }

    // アニメーションを開始
    startAnimation() {
        if (this.animationId) return; // 既に実行中の場合は何もしない

        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            // モードに応じたアニメーション
            this.updateForCurrentMode();

            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    // 現在のモードに応じた更新
    private updateForCurrentMode(): void {
        switch (this.currentMode) {
            case 'test':
                this.updateTestMode();
                break;
            case 'section':
                this.updateSectionMode();
                break;
            default:
                this.updateNormalMode();
        }
    }

    // 通常モードの更新
    private updateNormalMode(): void {
        this.cube.rotation.x += 0.01;
        this.cube.rotation.y += 0.01;

        // 緑色のワイヤーフレーム
        const material = this.cube.material as THREE.MeshBasicMaterial;
        material.color.setHex(0x00ff00);
    }

    // テストモードの更新
    private updateTestMode(): void {
        this.cube.rotation.x += 0.02; // 少し速く回転
        this.cube.rotation.y += 0.02;

        // 赤色のワイヤーフレーム
        const material = this.cube.material as THREE.MeshBasicMaterial;
        material.color.setHex(0xff0000);
    }

    // セクションモードの更新
    private updateSectionMode(): void {
        const colors = [0x0066ff, 0xffaa00, 0xaa00ff]; // セクション1:青、2:オレンジ、3:紫
        const speeds = [0.005, 0.01, 0.02]; // セクションごとの回転速度

        const colorIndex = Math.max(0, Math.min(this.sectionNumber - 1, colors.length - 1));
        const speed = speeds[colorIndex] || speeds[0];

        this.cube.rotation.x += speed;
        this.cube.rotation.y += speed;

        const material = this.cube.material as THREE.MeshBasicMaterial;
        material.color.setHex(colors[colorIndex]);
    }

    // テストモード設定
    setTestMode(enabled: boolean): void {
        this.currentMode = enabled ? 'test' : 'normal';
        console.log(`[THREE_VISUALIZER] Test mode: ${enabled}`);
    }

    // セクションモード設定
    setSectionMode(sectionNumber: number): void {
        this.currentMode = 'section';
        this.sectionNumber = sectionNumber;
        console.log(`[THREE_VISUALIZER] Section mode: ${sectionNumber}`);
    }

    // アニメーションを停止
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // リサイズハンドラーを設定
    private setupResizeHandler() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // 手動でリサイズ
    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        console.log(`[THREE_VISUALIZER] Renderer resized to ${width}x${height}`);
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
