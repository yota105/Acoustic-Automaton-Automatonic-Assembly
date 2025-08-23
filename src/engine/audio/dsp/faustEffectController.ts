// Faustエフェクト用コントローラークラス (Stub MVP)
// 今後: パラメータ列挙/バイパス/プリセット適用を拡張

export interface FaustEffectParam {
    id: string; // 正規化 paramId (例: "decay")
    addr: string; // Faust アドレス (例: "/reverb/decay")
    min: number;
    max: number;
    default: number;
}

export class FaustEffectController {
    readonly id: string;
    readonly node: AudioNode;
    private paramMap: Record<string, FaustEffectParam> = {};
    private bypass = false;

    constructor(id: string, node: AudioNode) {
        this.id = id;
        this.node = node;
    }

    registerParams(params: FaustEffectParam[]) {
        for (const p of params) this.paramMap[p.id] = p;
    }

    listParams(): FaustEffectParam[] { return Object.values(this.paramMap); }

    setParam(id: string, value: number) {
        const p = this.paramMap[id];
        if (!p) return;
        const v = Math.min(p.max, Math.max(p.min, value));

        try {
            // Faust WASM ノードが param アドレスを受け付ける前提で dispatch
            if (typeof (this.node as any).setParamValue === 'function') {
                (this.node as any).setParamValue(p.addr, v);
                console.log(`🎛️ Set param ${id} (${p.addr}) = ${v}`);
            } else {
                console.warn(`⚠️ Node does not support setParamValue: ${id}`);
            }
        } catch (error) {
            console.error(`❌ Failed to set param ${id}:`, error);
        }
    }

    setBypass(flag: boolean) { this.bypass = flag; }
    isBypassed() { return this.bypass; }
}
