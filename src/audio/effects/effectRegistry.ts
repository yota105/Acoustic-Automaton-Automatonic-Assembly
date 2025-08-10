// EffectRegistry: Faust (precompiled) / Native ノードを統一生成・キャッシュする MVP 実装
// 将来: runtime compile / latency compensation / preset 管理 拡張

import { FaustEffectController, FaustEffectParam } from '../dsp/faustEffectController';

export type EffectKind = 'faust-precompiled' | 'faust-compile' | 'native';

export interface EffectRegistryEntry {
    refId: string;            // 論理参照ID 例: 'revLarge'
    kind: EffectKind;
    label: string;
    create(ctx: AudioContext): Promise<EffectInstance>; // インスタンス生成
    preload?(ctx: AudioContext): Promise<void>;          // 先行ロード (wasm fetch 等)
    params?: FaustEffectParam[];                        // 既知パラメータ (Faust or Native wrapper)
    category?: string;                                   // UIカテゴリ (reverb/delay/dynamics ...)
}

export interface EffectInstance {
    id: string;          // ランタイム一意ID
    refId: string;       // Registry参照
    kind: EffectKind;
    node: AudioNode;
    controller?: FaustEffectController; // Faust系 or ラッパ
    bypass: boolean;
    dispose(): void;
}

// 内部キャッシュ
const registry = new Map<string, EffectRegistryEntry>();
const preloadCache = new Map<string, Promise<void>>();

export function registerEffect(entry: EffectRegistryEntry) {
    if (registry.has(entry.refId)) console.warn('[EffectRegistry] Duplicate refId', entry.refId);
    registry.set(entry.refId, entry);
}

export function listRegisteredEffects(): { refId: string; label: string; kind: EffectKind; category?: string }[] {
    return Array.from(registry.values()).map(r => ({ refId: r.refId, label: r.label, kind: r.kind, category: r.category }));
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
        refId: 'nativeGain', kind: 'native', label: 'Gain', category: 'utility',
        async create(ctx) {
            const g = ctx.createGain(); g.gain.value = 1;
            const fx = new FaustEffectController('gain_' + Math.random().toString(36).slice(2, 7), g);
            fx.registerParams([{ id: 'gain', addr: 'gain', min: 0, max: 2, default: 1 }]);
            return { id: fx.id, refId: 'nativeGain', kind: 'native', node: g, controller: fx, bypass: false, dispose() { try { g.disconnect(); } catch { } } };
        }
    });
    registerEffect({
        refId: 'nativeLPF', kind: 'native', label: 'LowPass', category: 'filter',
        async create(ctx) {
            const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = 8000;
            const fx = new FaustEffectController('lpf_' + Math.random().toString(36).slice(2, 7), b as unknown as AudioNode);
            fx.registerParams([
                { id: 'frequency', addr: 'frequency', min: 20, max: 20000, default: 8000 },
                { id: 'Q', addr: 'Q', min: 0.1, max: 20, default: 1 }
            ]);
            return { id: fx.id, refId: 'nativeLPF', kind: 'native', node: b, controller: fx, bypass: false, dispose() { try { b.disconnect(); } catch { } } };
        }
    });
    registerEffect({
        refId: 'nativeDelay', kind: 'native', label: 'Delay', category: 'time',
        async create(ctx) {
            const d = ctx.createDelay(1.0); d.delayTime.value = 0.25;
            const fx = new FaustEffectController('dly_' + Math.random().toString(36).slice(2, 7), d as unknown as AudioNode);
            fx.registerParams([
                { id: 'time', addr: 'delayTime', min: 0, max: 1, default: 0.25 }
            ]);
            return { id: fx.id, refId: 'nativeDelay', kind: 'native', node: d, controller: fx, bypass: false, dispose() { try { d.disconnect(); } catch { } } };
        }
    });
})();

// 将来: Faustプリコンパイルエフェクト登録関数 (wasm/json パス引数)
export function registerPrecompiledFaust(refId: string, label: string, wasmUrl: string, jsonUrl?: string) {
    registerEffect({
        refId, kind: 'faust-precompiled', label, category: 'faust',
        async preload(_ctx) {
            // ここで wasm を fetch & cache (実際の instantiate は faust wasm ライブラリ統合時に実装)
            await fetch(wasmUrl).then(r => { if (!r.ok) throw new Error('Fetch wasm fail'); return r.arrayBuffer(); });
            if (jsonUrl) await fetch(jsonUrl).then(r => { if (!r.ok) throw new Error('Fetch json fail'); return r.json(); });
        },
        async create(ctx) {
            // TODO: 実際の Faust WASM ノード生成処理を後続実装
            // 暫定: GainNode でプレースホルダ (param 例示)
            const g = ctx.createGain();
            const fx = new FaustEffectController(refId + '_' + Math.random().toString(36).slice(2, 7), g);
            fx.registerParams([
                { id: 'mix', addr: '/mix', min: 0, max: 1, default: 0.5 }
            ]);
            return { id: fx.id, refId, kind: 'faust-precompiled', node: g, controller: fx, bypass: false, dispose() { try { g.disconnect(); } catch { } } };
        }
    });
}
