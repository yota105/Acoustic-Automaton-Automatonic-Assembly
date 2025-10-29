/**
 * ParticleSystem - Three.jsパーティクルシステム
 * 
 * パフォーマンステスト用のランダムウォークパーティクル
 * 指定範囲内をランダムな速度で移動
 */

import * as THREE from 'three';

export interface ParticleSystemConfig {
    count: number;              // パーティクル数
    rangeX: [number, number];   // X軸の範囲 [min, max]
    rangeY: [number, number];   // Y軸の範囲 [min, max]
    rangeZ: [number, number];   // Z軸の範囲 [min, max]
    speedMin: number;           // 最小速度
    speedMax: number;           // 最大速度
    size: number;               // パーティクルサイズ
    color: number;              // パーティクル色
    opacity: number;            // 透明度
}

export class ParticleSystem {
    private particles!: THREE.Points;
    private particleCount: number;
    private positions: Float32Array;
    private velocities: Float32Array;
    private attractionStrengths: Float32Array; // 各パーティクルの引力強度
    private config: ParticleSystemConfig;

    // パフォーマンス計測用
    private lastUpdateTime: number = 0;
    private frameCount: number = 0;
    private fps: number = 60;

    constructor(config: Partial<ParticleSystemConfig> = {}) {
        // デフォルト設定
        this.config = {
            count: 1000,
            rangeX: [-50, 50],
            rangeY: [-50, 50],
            rangeZ: [-50, 50],
            speedMin: 0.1,
            speedMax: 0.5,
            size: 2,
            color: 0xffffff,
            opacity: 0.8,
            ...config
        };

        this.particleCount = this.config.count;
        this.positions = new Float32Array(this.particleCount * 3);
        this.velocities = new Float32Array(this.particleCount * 3);
        this.attractionStrengths = new Float32Array(this.particleCount); // 追加

        this.initializeParticles();
        this.createParticleSystem();

        console.log(`[PARTICLE_SYSTEM] Initialized with ${this.particleCount} particles`);
    }

    /**
     * パーティクルの初期化
     */
    private initializeParticles(): void {
        const { rangeX, rangeY, rangeZ, speedMin, speedMax } = this.config;

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;

            // ランダムな初期位置（範囲内）
            this.positions[i3] = this.randomInRange(rangeX[0], rangeX[1]);
            this.positions[i3 + 1] = this.randomInRange(rangeY[0], rangeY[1]);
            this.positions[i3 + 2] = this.randomInRange(rangeZ[0], rangeZ[1]);

            // ランダムな速度ベクトル
            const speed = this.randomInRange(speedMin, speedMax);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            this.velocities[i3] = speed * Math.sin(phi) * Math.cos(theta);
            this.velocities[i3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
            this.velocities[i3 + 2] = speed * Math.cos(phi);

            // 各パーティクルに個別の引力強度をランダムに設定（0.08〜0.25の範囲）
            this.attractionStrengths[i] = 0.08 + Math.random() * 0.17;
        }
    }

    /**
     * 円形テクスチャを生成（グラデーションなし）
     */
    private createCircleTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;

        const context = canvas.getContext('2d')!;
        
        // 単色の円を描画（グラデーションなし）
        context.fillStyle = 'rgba(255, 255, 255, 1)';
        context.beginPath();
        context.arc(16, 16, 16, 0, Math.PI * 2);
        context.fill();

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    /**
     * Three.jsパーティクルシステムの作成
     */
    private createParticleSystem(): void {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        const material = new THREE.PointsMaterial({
            size: this.config.size,
            color: this.config.color,
            transparent: true,
            opacity: this.config.opacity,
            sizeAttenuation: false, // サイズを一定に保つ
            map: this.createCircleTexture(), // 円形テクスチャを適用
            blending: THREE.NormalBlending, // 通常ブレンディングに変更（より濃く見える）
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
    }

    /**
     * パーティクルの更新（ランダムウォーク）
     */
    update(deltaTime: number = 0.016): void {
        const { rangeX, rangeY, rangeZ, speedMin, speedMax } = this.config;
        const now = performance.now();

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;

            // 位置更新
            this.positions[i3] += this.velocities[i3] * deltaTime * 60; // 60fps基準
            this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime * 60;
            this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime * 60;

            // 中心への引力による範囲制限（球面反発の代わり）
            const centerX = (rangeX[0] + rangeX[1]) / 2;
            const centerY = (rangeY[0] + rangeY[1]) / 2;
            const centerZ = (rangeZ[0] + rangeZ[1]) / 2;

            const dx = this.positions[i3] - centerX;
            const dy = this.positions[i3 + 1] - centerY;
            const dz = this.positions[i3 + 2] - centerZ;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // 目標範囲の半径を計算
            const radiusX = (rangeX[1] - rangeX[0]) / 2;
            const radiusY = (rangeY[1] - rangeY[0]) / 2;
            const radiusZ = (rangeZ[1] - rangeZ[0]) / 2;
            const targetRadius = Math.min(radiusX, radiusY, radiusZ);

            // 中心からの距離に応じた引力を適用
            if (distance > 0.01) { // ゼロ除算を防ぐ
                // 距離が遠いほど強い引力（二乗に比例）
                const distanceRatio = distance / targetRadius;
                // 各パーティクル固有の引力強度を使用
                const attractionStrength = this.attractionStrengths[i] * distanceRatio * distanceRatio * 0.0001;

                // 中心方向への力を速度に加える
                const normalX = -dx / distance; // 中心方向（マイナス）
                const normalY = -dy / distance;
                const normalZ = -dz / distance;

                this.velocities[i3] += normalX * attractionStrength * deltaTime * 60;
                this.velocities[i3 + 1] += normalY * attractionStrength * deltaTime * 60;
                this.velocities[i3 + 2] += normalZ * attractionStrength * deltaTime * 60;
            }

            // ランダムウォーク（たまに方向を変える）- 確率を下げる
            if (Math.random() < 0.002) { // 0.2%の確率で方向転換（さらに減少）
                const speed = this.randomInRange(speedMin, speedMax);

                // 現在の方向から小さな角度変更のみ許可
                const currentTheta = Math.atan2(this.velocities[i3 + 1], this.velocities[i3]);
                const currentPhi = Math.acos(this.velocities[i3 + 2] / Math.sqrt(
                    this.velocities[i3] * this.velocities[i3] +
                    this.velocities[i3 + 1] * this.velocities[i3 + 1] +
                    this.velocities[i3 + 2] * this.velocities[i3 + 2]
                ));

                // 角度変更を±30度以内に制限
                const maxAngleChange = Math.PI / 6; // 30度
                const theta = currentTheta + (Math.random() - 0.5) * maxAngleChange;
                const phi = currentPhi + (Math.random() - 0.5) * maxAngleChange;

                this.velocities[i3] = speed * Math.sin(phi) * Math.cos(theta);
                this.velocities[i3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
                this.velocities[i3 + 2] = speed * Math.cos(phi);
            }
        }

        // ジオメトリを更新
        this.particles.geometry.attributes.position.needsUpdate = true;

        // FPS計測
        this.frameCount++;
        if (now - this.lastUpdateTime > 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastUpdateTime = now;
            console.log(`[PARTICLE_SYSTEM] FPS: ${this.fps}, Particles: ${this.particleCount}`);
        }
    }

    /**
     * パーティクル数を変更
     */
    setParticleCount(count: number): void {
        console.log(`[PARTICLE_SYSTEM] Changing particle count: ${this.particleCount} → ${count}`);

        this.particleCount = count;
        this.config.count = count;
        this.positions = new Float32Array(count * 3);
        this.velocities = new Float32Array(count * 3);
        this.attractionStrengths = new Float32Array(count); // 引力強度配列も再作成

        this.initializeParticles();

        // ジオメトリを再作成
        this.particles.geometry.dispose();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.particles.geometry = geometry;
    }

    /**
     * パーティクル色を変更
     */
    setColor(color: number): void {
        const material = this.particles.material as THREE.PointsMaterial;
        material.color.setHex(color);
    }

    /**
     * パーティクルサイズを変更
     */
    setSize(size: number): void {
        const material = this.particles.material as THREE.PointsMaterial;
        material.size = size;
    }

    /**
     * Three.jsオブジェクトを取得
     */
    getPoints(): THREE.Points {
        return this.particles;
    }

    /**
     * 現在のFPSを取得
     */
    getFPS(): number {
        return this.fps;
    }

    /**
     * パーティクル数を取得
     */
    getParticleCount(): number {
        return this.particleCount;
    }

    /**
     * 全パーティクルの座標を取得
     * @returns パーティクルの座標配列 [{x, y, z}, ...]
     */
    getAllPositions(): Array<{ x: number, y: number, z: number }> {
        const positions: Array<{ x: number, y: number, z: number }> = [];
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            positions.push({
                x: this.positions[i3],
                y: this.positions[i3 + 1],
                z: this.positions[i3 + 2]
            });
        }
        return positions;
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        this.particles.geometry.dispose();
        (this.particles.material as THREE.PointsMaterial).dispose();
        console.log('[PARTICLE_SYSTEM] Disposed');
    }

    /**
     * ユーティリティ: 範囲内のランダム値
     */
    private randomInRange(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }
}
