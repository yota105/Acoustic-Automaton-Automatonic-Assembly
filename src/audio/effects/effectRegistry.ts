// EffectRegistry v2: DSPフォルダ構成対応 & カテゴリ自動判定
// Faust (precompiled) / Native ノードを統一生成・キャッシュ・カテゴリ管理

import { FaustEffectController, FaustEffectParam } from '../dsp/faustEffectController';
import { faustWasmLoader } from '../dsp/faustWasmLoader';

export type EffectKind = 'faust-precompiled' | 'faust-compile' | 'native';
export type EffectCategory = 'source' | 'effect' | 'hybrid' | 'utility';

export interface DSPCompatibility {
    canBeSource: boolean;     // 新Track単独配置可能
    canBeInsert: boolean;     // Insert chain配置可能  
    canBeSend: boolean;       // Send/Return配置可能
    requiresInput: boolean;   // 入力音声必須
}

export interface EffectRegistryEntry {
    refId: string;            // 論理参照ID 例: 'revLarge'
    kind: EffectKind;
    category: EffectCategory;
    subCategory?: string;     // 詳細分類 (reverb, compressor, oscillator等)
    label: string;
    description?: string;
    dspPath?: string;         // DSPファイルパス (public/dsp/からの相対)
    compatibility: DSPCompatibility;
    create(ctx: AudioContext): Promise<EffectInstance>; // インスタンス生成
    preload?(ctx: AudioContext): Promise<void>;          // 先行ロード (wasm fetch 等)
    params?: FaustEffectParam[];                        // 既知パラメータ
}

export interface EffectInstance {
    id: string;          // ランタイム一意ID
    refId: string;       // Registry参照
    kind: EffectKind;
    category: EffectCategory;
    node: AudioNode;
    controller?: FaustEffectController; // Faust系 or ラッパ
    bypass: boolean;
    dispose(): void;
}

// カテゴリ自動判定用マッピング
const categoryFromPath: Record<string, EffectCategory> = {
    'synths/': 'source',
    'effects/': 'effect',
    '': 'hybrid'  // ルートレベルは汎用扱い
};

// 内部キャッシュ
const registry = new Map<string, EffectRegistryEntry>();
const preloadCache = new Map<string, Promise<void>>();

export function registerEffect(entry: EffectRegistryEntry) {
    if (registry.has(entry.refId)) console.warn('[EffectRegistry] Duplicate refId', entry.refId);
    registry.set(entry.refId, entry);
}

export function listRegisteredEffects(): { refId: string; label: string; kind: EffectKind; category: EffectCategory; subCategory?: string }[] {
    return Array.from(registry.values()).map(r => ({
        refId: r.refId,
        label: r.label,
        kind: r.kind,
        category: r.category,
        subCategory: r.subCategory
    }));
}

// DSPパスからカテゴリを自動判定
export function getCategoryFromPath(dspPath: string): EffectCategory {
    for (const [prefix, category] of Object.entries(categoryFromPath)) {
        if (dspPath.startsWith(prefix)) return category;
    }
    return 'hybrid'; // デフォルト
}

// DSPファイル自動検索・登録関数
export async function scanAndRegisterDSPFiles(): Promise<void> {
    const dspPaths = [
        // ルートレベル
        'mysynth.dsp',
        'testsignals.dsp',
        'testsynth.dsp',
        // サブディレクトリ（将来的に実装）
        // 'synths/', 'effects/'
    ];

    console.log('[EffectRegistry] Starting DSP file scan...');
    let registeredCount = 0;

    for (const dspPath of dspPaths) {
        try {
            await registerDSPFromFile(dspPath);
            registeredCount++;
        } catch (error) {
            console.warn(`[EffectRegistry] Failed to register DSP: ${dspPath}`, error);
        }
    }

    console.log(`[EffectRegistry] DSP scan completed. Registered ${registeredCount} effects`);

    // UIに更新を通知
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('effect-registry-updated', {
            detail: { totalEffects: registry.size, newlyRegistered: registeredCount }
        }));
    }
}

// 個別DSPファイル登録
async function registerDSPFromFile(dspPath: string): Promise<void> {
    const baseName = dspPath.replace('.dsp', '');
    const jsonPath = `${baseName}.json`;

    try {
        // メタデータファイルを読み込み
        const response = await fetch(`/dsp/${jsonPath}`);
        if (!response.ok) {
            console.warn(`[EffectRegistry] No metadata file for ${dspPath}, skipping`);
            return;
        }

        const metadata = await response.json();

        // カテゴリ自動判定（メタデータ優先、フォールバックはパス判定）
        const category = metadata.category || getCategoryFromPath(dspPath);

        registerEffect({
            refId: metadata.refId || baseName,
            kind: metadata.kind || 'faust-precompiled',
            category,
            subCategory: metadata.subCategory,
            label: metadata.label || baseName,
            description: metadata.description,
            dspPath,
            compatibility: metadata.compatibility || {
                canBeSource: category === 'source',
                canBeInsert: true,
                canBeSend: true,
                requiresInput: category !== 'source'
            },
            params: metadata.params,
            async preload(_ctx) {
                // DSPファイルのプリロード（将来のFaust WASM統合用）
                await fetch(`/dsp/${dspPath}`).then(r => {
                    if (!r.ok) throw new Error(`Failed to fetch DSP: ${dspPath}`);
                    return r.text();
                });
            },
            async create(ctx) {
                try {
                    // FaustWasmLoaderを使用してAudioWorkletNodeを生成
                    const faustNode = await faustWasmLoader.loadFaustNode(ctx, baseName);

                    // FaustEffectControllerでラップ
                    const fx = new FaustEffectController(
                        `${metadata.refId || baseName}_${Math.random().toString(36).slice(2, 7)}`,
                        faustNode
                    );

                    // パラメータ情報を取得・登録
                    const paramInfo = faustWasmLoader.getParameterInfo(baseName);
                    const faustParams: FaustEffectParam[] = paramInfo.map(p => ({
                        id: p.label.toLowerCase().replace(/\s+/g, '_'),
                        addr: p.address,
                        min: p.min,
                        max: p.max,
                        default: p.init
                    }));

                    // メタデータのパラメータも併用（メタデータ優先）
                    if (metadata.params) {
                        fx.registerParams(metadata.params);
                    } else {
                        fx.registerParams(faustParams);
                    }

                    console.log(`✅ Created Faust DSP: ${baseName}`, {
                        paramCount: metadata.params?.length || faustParams.length
                    });

                    return {
                        id: fx.id,
                        refId: metadata.refId || baseName,
                        kind: metadata.kind || 'faust-precompiled',
                        category,
                        node: faustNode,
                        controller: fx,
                        bypass: false,
                        dispose() {
                            try {
                                faustNode.disconnect();
                                // Faustノードのクリーンアップがあれば追加
                            } catch { }
                        }
                    };
                } catch (error) {
                    console.error(`❌ Failed to create Faust DSP ${baseName}:`, error);

                    // フォールバック: GainNodeでプレースホルダ作成
                    console.log(`🔧 Creating fallback GainNode for ${baseName}`);
                    const g = ctx.createGain();
                    const fx = new FaustEffectController(
                        `${metadata.refId || baseName}_fallback_${Math.random().toString(36).slice(2, 7)}`,
                        g
                    );

                    // メタデータからパラメータ登録
                    if (metadata.params) {
                        fx.registerParams(metadata.params);
                    }

                    return {
                        id: fx.id,
                        refId: metadata.refId || baseName,
                        kind: metadata.kind || 'faust-precompiled',
                        category,
                        node: g,
                        controller: fx,
                        bypass: false,
                        dispose() { try { g.disconnect(); } catch { } }
                    };
                }
            }
        });

        console.log(`[EffectRegistry] Registered DSP: ${dspPath} as ${metadata.refId || baseName}`);

    } catch (error) {
        console.error(`[EffectRegistry] Failed to register DSP ${dspPath}:`, error);
    }
}

export async function preloadEffect(refId: string, ctx: AudioContext) {
    const entry = registry.get(refId);
    if (!entry) throw new Error('Effect not found: ' + refId);
    if (!entry.preload) return; // 何もしない
    if (!preloadCache.has(refId)) {
        preloadCache.set(refId, entry.preload(ctx).catch(e => { preloadCache.delete(refId); throw e; }));
    }
    return preloadCache.get(refId)!;
}

export async function preloadAll(ctx: AudioContext, targetRefIds?: string[]) {
    const ids = targetRefIds ?? Array.from(registry.keys());
    await Promise.all(ids.map(id => preloadEffect(id, ctx).catch(err => console.warn('[EffectRegistry] preload fail', id, err))));
}

export async function createEffectInstance(refId: string, ctx: AudioContext): Promise<EffectInstance> {
    const entry = registry.get(refId);
    if (!entry) throw new Error('Effect not registered: ' + refId);
    try { await preloadEffect(refId, ctx); } catch { /* ignore preload failure (fallback inside create) */ }
    const inst = await entry.create(ctx);
    return inst;
}

// === 一部ネイティブ簡易エフェクトプリセット登録 (Gain / LPF / Delay) ===
(function bootstrapNative() {
    registerEffect({
        refId: 'nativeGain',
        kind: 'native',
        category: 'utility',
        subCategory: 'gain',
        label: 'Gain',
        compatibility: {
            canBeSource: false,
            canBeInsert: true,
            canBeSend: true,
            requiresInput: true
        },
        async create(ctx) {
            const g = ctx.createGain(); g.gain.value = 1;
            const fx = new FaustEffectController('gain_' + Math.random().toString(36).slice(2, 7), g);
            fx.registerParams([{ id: 'gain', addr: 'gain', min: 0, max: 2, default: 1 }]);
            return {
                id: fx.id,
                refId: 'nativeGain',
                kind: 'native',
                category: 'utility',
                node: g,
                controller: fx,
                bypass: false,
                dispose() { try { g.disconnect(); } catch { } }
            };
        }
    });

    registerEffect({
        refId: 'nativeLPF',
        kind: 'native',
        category: 'effect',
        subCategory: 'filter',
        label: 'LowPass',
        compatibility: {
            canBeSource: false,
            canBeInsert: true,
            canBeSend: true,
            requiresInput: true
        },
        async create(ctx) {
            const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 8000;
            const fx = new FaustEffectController('lpf_' + Math.random().toString(36).slice(2, 7), b as unknown as AudioNode);
            fx.registerParams([
                { id: 'frequency', addr: 'frequency', min: 20, max: 20000, default: 8000 },
                { id: 'Q', addr: 'Q', min: 0.1, max: 20, default: 1 }
            ]);
            return {
                id: fx.id,
                refId: 'nativeLPF',
                kind: 'native',
                category: 'effect',
                node: b,
                controller: fx,
                bypass: false,
                dispose() { try { b.disconnect(); } catch { } }
            };
        }
    });

    registerEffect({
        refId: 'nativeDelay',
        kind: 'native',
        category: 'effect',
        subCategory: 'time',
        label: 'Delay',
        compatibility: {
            canBeSource: false,
            canBeInsert: true,
            canBeSend: true,
            requiresInput: true
        },
        async create(ctx) {
            const d = ctx.createDelay(1.0); d.delayTime.value = 0.25;
            const fx = new FaustEffectController('dly_' + Math.random().toString(36).slice(2, 7), d as unknown as AudioNode);
            fx.registerParams([
                { id: 'time', addr: 'delayTime', min: 0, max: 1, default: 0.25 }
            ]);
            return {
                id: fx.id,
                refId: 'nativeDelay',
                kind: 'native',
                category: 'effect',
                node: d,
                controller: fx,
                bypass: false,
                dispose() { try { d.disconnect(); } catch { } }
            };
        }
    });
})();

// 将来: Faustプリコンパイルエフェクト登録関数 (wasm/json パス引数)
export function registerPrecompiledFaust(
    refId: string,
    label: string,
    wasmUrl: string,
    jsonUrl?: string,
    category: EffectCategory = 'effect',
    subCategory?: string
) {
    registerEffect({
        refId,
        kind: 'faust-precompiled',
        category,
        subCategory,
        label,
        dspPath: wasmUrl,
        compatibility: {
            canBeSource: category === 'source',
            canBeInsert: true,
            canBeSend: true,
            requiresInput: category !== 'source'
        },
        async preload(_ctx) {
            // ここで wasm を fetch & cache (実際の instantiate は faust wasm ライブラリ統合時に実装)
            await fetch(wasmUrl).then(r => { if (!r.ok) throw new Error('Fetch wasm fail'); return r.arrayBuffer(); });
            if (jsonUrl) await fetch(jsonUrl).then(r => { if (!r.ok) throw new Error('Fetch json fail'); return r.json(); });
        },
        async create(ctx) {
            try {
                // DSP名をwasmUrlから抽出 (例: "/audio/mysynth.wasm" → "mysynth")
                const dspName = wasmUrl.split('/').pop()?.replace('.wasm', '') || refId;

                // FaustWasmLoaderを使用してAudioWorkletNodeを生成
                const faustNode = await faustWasmLoader.loadFaustNode(ctx, dspName);

                // FaustEffectControllerでラップ
                const fx = new FaustEffectController(refId + '_' + Math.random().toString(36).slice(2, 7), faustNode);

                // パラメータ情報を取得・登録
                const paramInfo = faustWasmLoader.getParameterInfo(dspName);
                const faustParams: FaustEffectParam[] = paramInfo.map(p => ({
                    id: p.label.toLowerCase().replace(/\s+/g, '_'),
                    addr: p.address,
                    min: p.min,
                    max: p.max,
                    default: p.init
                }));

                fx.registerParams(faustParams);

                console.log(`✅ Created Faust effect: ${refId}`, {
                    dspName,
                    params: faustParams.length
                });

                return {
                    id: fx.id,
                    refId,
                    kind: 'faust-precompiled',
                    category,
                    node: faustNode,
                    controller: fx,
                    bypass: false,
                    dispose() {
                        try {
                            faustNode.disconnect();
                            // Faustノードのクリーンアップがあれば追加
                        } catch { }
                    }
                };
            } catch (error) {
                console.error(`❌ Failed to create Faust effect ${refId}:`, error);

                // フォールバック: GainNodeでプレースホルダ作成
                console.log(`🔧 Creating fallback GainNode for ${refId}`);
                const g = ctx.createGain();
                const fx = new FaustEffectController(refId + '_fallback_' + Math.random().toString(36).slice(2, 7), g);
                fx.registerParams([
                    { id: 'mix', addr: '/mix', min: 0, max: 1, default: 0.5 }
                ]);
                return {
                    id: fx.id,
                    refId,
                    kind: 'faust-precompiled',
                    category,
                    node: g,
                    controller: fx,
                    bypass: false,
                    dispose() { try { g.disconnect(); } catch { } }
                };
            }
        }
    });
}
