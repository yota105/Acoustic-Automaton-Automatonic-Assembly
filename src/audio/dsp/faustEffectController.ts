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
        // Faust WASM ノードが param アドレスを受け付ける前提で dispatch (後で adapter 注入)
        // @ts-ignore 型は後で faust wasm 型定義に差し替え
        if (typeof (this.node as any).setParamValue === 'function') {
            (this.node as any).setParamValue(p.addr, v);
        }
    }

    setBypass(flag: boolean) { this.bypass = flag; }
    isBypassed() { return this.bypass; }
}
