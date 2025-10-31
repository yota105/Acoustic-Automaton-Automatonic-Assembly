// Audio Bus Manager: synth / effects / monitor buses and per LogicInput routing
import { LogicInput } from '../../../audio/logicInputs';
import { createEffectInstance, EffectInstance } from '../effects/effectRegistry';

export interface LogicInputConnection {
    logicInputId: string;
    sourceNode: GainNode; // per logic input gain node (input gain control)
    connected: { synth: boolean; effects: boolean; monitor: boolean };
    upstream?: AudioNode; // physical/mic gain node etc.
}

// 拡張: EffectsChainItem にEffectRegistry v2対応
export interface EffectsChainItem {
    id: string;
    type: string;
    node: AudioNode;
    bypass: boolean;
    // EffectRegistry v2統合フィールド
    refId?: string;      // EffectRegistry参照ID
    instance?: EffectInstance; // EffectRegistry v2インスタンス
}

export class BusManager {
    private synthBus: GainNode;
    private effectsBus: GainNode; // placeholder (bypass or chain input)
    private monitorBus: GainNode;
    public outputGainNode: GainNode; // Track出力用のマスターゲイン
    public effectsInput: GainNode;   // Track接続用のエフェクト入力
    private inputConnections = new Map<string, LogicInputConnection>();
    private effectsChain: AudioNode[] = []; // effectsBus から destination までの中間チェーン (旧)
    private chainItems: EffectsChainItem[] = []; // 新メタ付きチェーン
    private currentChain?: { nodes: AudioNode[]; tailGain: GainNode };
    private crossfadeEnabled = false; // クロスフェード無効化(テールゲインが0になる問題を回避)
    private crossfadeDuration = 0.02; // 20ms

    private pendingFxOps: { op: 'add' | 'remove' | 'move' | 'bypass' | 'clear'; payload?: any }[] = [];
    private ready = true; // 今は常に true (将来: 初期化前に false)

    constructor(private ctx: AudioContext, private destination: AudioNode) {
        this.synthBus = ctx.createGain();
        this.effectsBus = ctx.createGain();
        this.monitorBus = ctx.createGain();

        // Track統合用の新しいノード
        this.outputGainNode = ctx.createGain();
        this.effectsInput = ctx.createGain();

        // 基本接続: effectsInput → outputGainNode → destination
        this.effectsInput.connect(this.outputGainNode);
        this.outputGainNode.connect(destination);

        // 既存のバス接続は維持
        this.synthBus.connect(destination);
        this.monitorBus.connect(destination);

        // effectsBusは初期状態でdestinationに直接接続（エフェクトチェーンなし）
        // この接続はrebuildChain()で再構築される
        this.effectsBus.connect(destination);

        console.log('🔌 BusManager initialized with Track integration support');
        console.log('ℹ️ effectsBus initially connected directly to destination (will be rebuilt when effects are added)');
    }

    // === Effects Chain Management (旧API互換) ===
    insertEffectsChain(nodes: AudioNode[]) {
        // 現在のチェーン解除
        try { this.effectsBus.disconnect(); } catch { /* ignore */ }
        this.effectsChain.forEach(n => { try { n.disconnect(); } catch { /* ignore */ } });
        this.effectsChain = [];
        this.chainItems = [];

        if (!nodes || nodes.length === 0) {
            try { this.effectsBus.connect(this.destination); } catch { /* ignore */ }
            console.log('[BusManager] Effects chain cleared, effectsBus connected directly to destination');
            this.dispatchChainChanged();
            return;
        }
        let prev: AudioNode = this.effectsBus;
        nodes.forEach((n, idx) => {
            try { prev.connect(n); } catch { /* ignore */ }
            prev = n;
            this.chainItems.push({ id: `fx${idx}`, type: n.constructor.name, node: n, bypass: false });
        });
        try { prev.connect(this.destination); } catch { /* ignore */ }
        this.effectsChain = [...nodes];
        console.log(`[BusManager] Effects chain built with ${nodes.length} nodes: effectsBus → effects → destination`);
        this.dispatchChainChanged();
    }

    clearEffectsChain() { this.insertEffectsChain([]); }

    // === 新API: シンプルなエフェクト挿入/削除/並び替え ===
    private rebuildChain() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const fade = this.crossfadeEnabled ? this.crossfadeDuration : 0;
        const old = this.currentChain;

        // 有効なノード抽出 (bypass=false)
        const activeNodes: AudioNode[] = [];
        this.chainItems.forEach(item => { if (!item.bypass) activeNodes.push(item.node); });

        // 既存の接続を一度クリーンにすることでバイパス経路を残さない
        // 特に effectsBus → destination の直接接続を確実に切断
        try {
            this.effectsBus.disconnect();
            console.log('[BusManager] effectsBus disconnected from all targets (including direct destination)');
        } catch { /* ignore disconnect errors */ }

        // 古いチェーンの接続も確実に切断
        if (old) {
            try { old.tailGain.disconnect(); } catch { /* ignore */ }
            old.nodes.forEach(n => { try { n.disconnect(); } catch { /* ignore */ } });
            console.log('[BusManager] Old chain disconnected');
        }

        this.chainItems.forEach(item => {
            try { item.node.disconnect(); } catch { /* ignore disconnect errors */ }
        });
        console.log(`[BusManager] All ${this.chainItems.length} effect nodes disconnected`);

        // 新チェーン tailGain
        const tail = ctx.createGain();
        if (fade > 0) {
            tail.gain.setValueAtTime(0, now);
            console.log('[BusManager] rebuildChain: fade enabled, tail gain will ramp to 1');
        } else {
            tail.gain.setValueAtTime(1, now);
            console.log('[BusManager] rebuildChain: fade disabled, tail gain set to 1 immediately');
        }

        // 接続構築 (effectsBus -> nodes... -> tail -> destination)
        let prev: AudioNode = this.effectsBus;
        activeNodes.forEach(n => { try { prev.connect(n); } catch { } prev = n; });
        try { prev.connect(tail); } catch { }
        try { tail.connect(this.destination); } catch { }

        console.log(`[BusManager] Chain rebuilt: ${activeNodes.length} active nodes, tail gain = ${tail.gain.value}`);
        console.log(`[BusManager] Signal path: effectsBus → ${activeNodes.length} effect(s) → tailGain → destination`);

        // クロスフェード処理
        if (old && fade > 0) {
            // フェード有効時のみクロスフェード実行
            try {
                old.tailGain.gain.setValueAtTime(old.tailGain.gain.value, now);
                old.tailGain.gain.linearRampToValueAtTime(0, now + fade);
            } catch { }
            try {
                tail.gain.setValueAtTime(0, now);
                tail.gain.linearRampToValueAtTime(1, now + fade);
            } catch { }
            // 後片付け (余裕バッファ付き)
            setTimeout(() => {
                // 既に上で切断済みなので、念のため再実行
                try { old.tailGain.disconnect(); } catch { }
            }, (fade * 1000) + 60);
        }
        // 注: fade無効時は上で既に切断済み

        this.currentChain = { nodes: activeNodes, tailGain: tail };
        this.effectsChain = activeNodes; // 互換フィールド更新
        this.dispatchChainChanged();
    }

    private createEffectNode(type: string): AudioNode {
        switch (type) {
            case 'gain': {
                const g = this.ctx.createGain();
                g.gain.value = 1;
                return g;
            }
            case 'biquad': {
                const b = this.ctx.createBiquadFilter();
                b.type = 'lowpass';
                b.frequency.value = 8000;
                return b;
            }
            case 'delay': {
                const d = this.ctx.createDelay(1.0);
                d.delayTime.value = 0.25;
                return d;
            }
            default: {
                const p = this.ctx.createGain();
                p.gain.value = 1;
                return p;
            }
        }
    }

    addEffect(type: string): EffectsChainItem {
        const node = this.createEffectNode(type);
        const item: EffectsChainItem = { id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, type, node, bypass: false };
        this.chainItems.push(item);
        this.rebuildChain();
        return item;
    }

    // EffectRegistry v2からエフェクトを追加 (新機能)
    async addEffectFromRegistry(refId: string): Promise<EffectsChainItem> {
        try {
            console.log(`[BusManager] Adding effect from registry: ${refId}`);
            const instance = await createEffectInstance(refId, this.ctx);
            const item: EffectsChainItem = {
                id: instance.id,
                type: `${instance.kind}:${refId}`,
                node: instance.node,
                bypass: false,
                refId,
                instance
            };
            this.chainItems.push(item);
            console.log(`[BusManager] Effect ${refId} added to chain items, rebuilding chain...`);
            this.rebuildChain();
            console.log(`[BusManager] ✅ Successfully added and connected effect: ${refId}`);
            return item;
        } catch (error) {
            console.error(`[BusManager] Failed to add effect ${refId}:`, error);
            // フォールバック: 基本Gainノードで代替
            return this.addEffect('gain');
        }
    }

    removeEffect(id: string) {
        const idx = this.chainItems.findIndex(i => i.id === id);
        if (idx < 0) return;
        this.chainItems.splice(idx, 1);
        this.rebuildChain();
    }

    toggleBypass(id: string) {
        const it = this.chainItems.find(i => i.id === id);
        if (!it) return;
        it.bypass = !it.bypass;
        this.rebuildChain();
    }

    moveEffect(id: string, newIndex: number) {
        const idx = this.chainItems.findIndex(i => i.id === id);
        if (idx < 0) return;
        const [it] = this.chainItems.splice(idx, 1);
        if (newIndex < 0) newIndex = 0;
        if (newIndex > this.chainItems.length) newIndex = this.chainItems.length;
        this.chainItems.splice(newIndex, 0, it);
        this.rebuildChain();
    }

    getEffectsChainMeta(): { id: string; type: string; bypass: boolean; index: number; refId?: string }[] {
        return this.chainItems.map((c, i) => ({
            id: c.id,
            type: c.type,
            bypass: c.bypass,
            index: i,
            refId: c.refId
        }));
    }

    private dispatchChainChanged() {
        document.dispatchEvent(new CustomEvent('effects-chain-changed', { detail: { items: this.getEffectsChainMeta() } }));
    }

    // === LogicInput routing ===
    ensureInput(logic: LogicInput): LogicInputConnection {
        let conn = this.inputConnections.get(logic.id);
        if (!conn) {
            const g = this.ctx.createGain();
            g.gain.value = logic.gain;
            conn = { logicInputId: logic.id, sourceNode: g, connected: { synth: false, effects: false, monitor: false } };
            this.inputConnections.set(logic.id, conn);
        }
        return conn;
    }

    attachSource(logicId: string, upstream: AudioNode) {
        const conn = this.inputConnections.get(logicId);
        if (!conn) return;
        if (conn.upstream === upstream) return; // unchanged
        try { conn.upstream?.disconnect(conn.sourceNode); } catch { /* ignore */ }
        try { upstream.connect(conn.sourceNode); conn.upstream = upstream; } catch { /* ignore */ }
    }

    detachSource(logicId: string) {
        const conn = this.inputConnections.get(logicId);
        if (!conn || !conn.upstream) return;
        try { conn.upstream.disconnect(conn.sourceNode); } catch { /* ignore */ }
        conn.upstream = undefined;
    }

    updateLogicInput(logic: LogicInput) {
        const conn = this.ensureInput(logic);
        conn.sourceNode.gain.value = logic.enabled ? logic.gain : 0;
        const desired = logic.routing;
        (['synth', 'effects', 'monitor'] as const).forEach(route => {
            const want = desired[route];
            const isConnected = conn.connected[route];
            const target = route === 'synth' ? this.synthBus : route === 'effects' ? this.effectsBus : this.monitorBus;
            if (want && !isConnected) {
                conn.sourceNode.connect(target);
                conn.connected[route] = true;
            } else if (!want && isConnected) {
                try { conn.sourceNode.disconnect(target); } catch { /* ignore */ }
                conn.connected[route] = false;
            }
        });
    }

    detachLogicInput(id: string) {
        const conn = this.inputConnections.get(id);
        if (!conn) return;
        try { conn.sourceNode.disconnect(); } catch { /* ignore */ }
        this.detachSource(id);
        conn.sourceNode.gain.value = 0;
        this.inputConnections.delete(id);
    }

    getInputNode(id: string): GainNode | undefined { return this.inputConnections.get(id)?.sourceNode; }
    getSynthInputNode(): GainNode { return this.synthBus; }
    getEffectsInputNode(): GainNode { return this.effectsBus; }
    getMonitorInputNode(): GainNode { return this.monitorBus; }
    getInputGainNode(logicId: string): GainNode | undefined {
        return (this as any).inputConnections?.get(logicId)?.sourceNode; // メータ/テスト用 (将来public API整理)
    }

    enqueueFxOp(op: 'add' | 'remove' | 'move' | 'bypass' | 'clear', payload?: any) {
        if (this.ready) {
            this.applyFxOp(op, payload);
        } else {
            this.pendingFxOps.push({ op, payload });
        }
    }

    flushFxOps() {
        if (!this.ready) return;
        while (this.pendingFxOps.length) {
            const { op, payload } = this.pendingFxOps.shift()!;
            this.applyFxOp(op, payload);
        }
    }

    private applyFxOp(op: string, payload: any) {
        switch (op) {
            case 'add': this.addEffect(payload.type); break;
            case 'remove': this.removeEffect(payload.id); break;
            case 'move': this.moveEffect(payload.id, payload.newIndex); break;
            case 'bypass': this.toggleBypass(payload.id); break;
            case 'clear': this.clearEffectsChain(); break;
        }
    }
}
