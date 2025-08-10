// Audio Bus Manager: synth / effects / monitor buses and per LogicInput routing
import { LogicInput } from './logicInputs';

export interface LogicInputConnection {
    logicInputId: string;
    sourceNode: GainNode; // per logic input gain node (input gain control)
    connected: { synth: boolean; effects: boolean; monitor: boolean };
    upstream?: AudioNode; // physical/mic gain node etc.
}

// 追加: EffectsChainItem メタ
export interface EffectsChainItem { id: string; type: string; node: AudioNode; bypass: boolean; }

export class BusManager {
    private synthBus: GainNode;
    private effectsBus: GainNode; // placeholder (bypass or chain input)
    private monitorBus: GainNode;
    private inputConnections = new Map<string, LogicInputConnection>();
    private effectsChain: AudioNode[] = []; // effectsBus から destination までの中間チェーン (旧)
    private chainItems: EffectsChainItem[] = []; // 新メタ付きチェーン
    private currentChain?: { nodes: AudioNode[]; tailGain: GainNode };
    private crossfadeEnabled = true;
    private crossfadeDuration = 0.02; // 20ms

    constructor(private ctx: AudioContext, private destination: AudioNode) {
        this.synthBus = ctx.createGain();
        this.effectsBus = ctx.createGain();
        this.monitorBus = ctx.createGain();
        this.synthBus.connect(destination);
        this.effectsBus.connect(destination); // 初期: 直結
        this.monitorBus.connect(destination);
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

        // 新チェーン tailGain
        const tail = ctx.createGain();
        if (fade > 0) tail.gain.setValueAtTime(0, now); else tail.gain.setValueAtTime(1, now);

        // 接続構築 (effectsBus -> nodes... -> tail -> destination)
        let prev: AudioNode = this.effectsBus;
        activeNodes.forEach(n => { try { prev.connect(n); } catch { } prev = n; });
        try { prev.connect(tail); } catch { }
        try { tail.connect(this.destination); } catch { }

        // クロスフェード処理
        if (old) {
            if (fade > 0) {
                // 古い tail を 0 へ, 新しい tail を 1 へ
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
                    try { old.tailGain.disconnect(); } catch { }
                    old.nodes.forEach(n => { try { n.disconnect(); } catch { } });
                }, (fade * 1000) + 60);
            } else {
                // 即時切替: 旧チェーン全切断
                try { old.tailGain.disconnect(); } catch { }
                old.nodes.forEach(n => { try { n.disconnect(); } catch { } });
            }
        }

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

    getEffectsChainMeta(): { id: string; type: string; bypass: boolean; index: number }[] {
        return this.chainItems.map((c, i) => ({ id: c.id, type: c.type, bypass: c.bypass, index: i }));
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
    getEffectsInputNode(): GainNode { return this.effectsBus; }
}
