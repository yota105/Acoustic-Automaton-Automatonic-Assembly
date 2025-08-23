// Faust WASM ローダー: プリコンパイル済みWASMファイルからAudioWorkletNodeを生成
// - .wasmと.jsonファイルのロード・解析
// - AudioWorkletNode生成とパラメータマッピング
// - キャッシュ機構とエラーハンドリング

import {
    instantiateFaustModuleFromFile,
    LibFaust,
    FaustCompiler,
    FaustMonoDspGenerator,
    FaustMonoAudioWorkletNode
} from "@grame/faustwasm";

export interface FaustWasmMetadata {
    name: string;
    filename: string;
    version: string;
    ui: any[];
    inputs: number;
    outputs: number;
    code?: string;
}

export interface FaustParamInfo {
    type: string;
    label: string;
    address: string;
    index: number;
    init: number;
    min: number;
    max: number;
    step: number;
}

// WASMファイルとメタデータのキャッシュ
const wasmCache = new Map<string, ArrayBuffer>();
const metadataCache = new Map<string, FaustWasmMetadata>();
const paramCache = new Map<string, FaustParamInfo[]>();
const moduleCache = new Map<string, any>(); // FaustModule cache

export class FaustWasmLoader {
    private static instance: FaustWasmLoader;
    private libFaust?: LibFaust;
    private compiler?: FaustCompiler;

    private constructor() { }

    static getInstance(): FaustWasmLoader {
        if (!FaustWasmLoader.instance) {
            FaustWasmLoader.instance = new FaustWasmLoader();
        }
        return FaustWasmLoader.instance;
    }

    /**
     * FaustWasmライブラリの初期化
     */
    async initializeFaustWasm(): Promise<void> {
        if (this.libFaust && this.compiler) return;

        try {
            // FaustWasmライブラリをインポート・初期化
            const faustMod = await instantiateFaustModuleFromFile("/faust/libfaust-wasm.js");
            this.libFaust = new LibFaust(faustMod);
            this.compiler = new FaustCompiler(this.libFaust);
            console.log('✅ FaustWasm initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize FaustWasm:', error);
            throw new Error(`FaustWasm initialization failed: ${error}`);
        }
    }

    /**
     * プリコンパイル済みDSPファイルからAudioWorkletNodeを生成
     */
    async loadFaustNode(
        audioContext: AudioContext,
        dspName: string,
        basePath: string = '/dsp'
    ): Promise<FaustMonoAudioWorkletNode> {
        await this.initializeFaustWasm();

        if (!this.libFaust || !this.compiler) {
            throw new Error('FaustWasm not initialized');
        }

        try {
            // DSPコードをロード
            const dspCode = await this.loadDspFile(`${basePath}/${dspName}.dsp`);

            // Generator作成とコンパイル
            const gen = new FaustMonoDspGenerator();
            await gen.compile(this.compiler, dspName, dspCode, "");

            // AudioWorkletをロード
            if ((gen as any).load) {
                await (gen as any).load(audioContext.audioWorklet);
            }

            // AudioWorkletNodeを作成
            const node = await gen.createNode(audioContext);
            if (!node) {
                throw new Error("AudioWorklet not supported");
            }

            // パラメータ情報を抽出・キャッシュ
            try {
                const params = await this.extractParametersFromNode(node);
                paramCache.set(dspName, params);
                console.log(`✅ Faust node created: ${dspName}`, {
                    inputs: node.numberOfInputs,
                    outputs: node.numberOfOutputs,
                    params: params.length
                });
            } catch (paramError) {
                console.warn(`⚠️ Failed to extract parameters for ${dspName}:`, paramError);
                paramCache.set(dspName, []);
            }

            return node;
        } catch (error) {
            console.error(`❌ Failed to load Faust node ${dspName}:`, error);
            throw new Error(`Failed to load Faust node ${dspName}: ${error}`);
        }
    }

    /**
     * DSPファイルをロード（キャッシュ付き）
     */
    private async loadDspFile(url: string): Promise<string> {
        try {
            console.log(`📥 Loading DSP: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            throw new Error(`Failed to load DSP file ${url}: ${error}`);
        }
    }

    /**
     * AudioWorkletNodeからパラメータ情報を抽出
     */
    private async extractParametersFromNode(node: FaustMonoAudioWorkletNode): Promise<FaustParamInfo[]> {
        try {
            // FaustノードからUIパラメータを取得
            const params: any = await (node as any).getParams?.();
            if (!params || !Array.isArray(params)) {
                return [];
            }

            return params.map((param: any) => ({
                type: param.type || 'slider',
                label: param.label || param.name || 'Unknown',
                address: param.address || param.path || '',
                index: param.index || 0,
                init: param.init || param.default || 0,
                min: param.min || 0,
                max: param.max || 1,
                step: param.step || 0.01
            }));
        } catch (error) {
            console.warn('Failed to extract parameters from Faust node:', error);
            return [];
        }
    }

    /**
     * DSPのパラメータ情報を取得
     */
    getParameterInfo(dspName: string): FaustParamInfo[] {
        return paramCache.get(dspName) || [];
    }

    /**
     * キャッシュをクリア
     */
    clearCache(): void {
        wasmCache.clear();
        metadataCache.clear();
        paramCache.clear();
        moduleCache.clear();
        console.log('🧹 Faust WASM cache cleared');
    }

    /**
     * 利用可能なDSPファイルをスキャン
     */
    async scanAvailableDSP(basePath: string = '/dsp'): Promise<string[]> {
        // 既知のDSPファイルリスト（後で動的スキャンに拡張可能）
        const knownDSPs = ['mysynth', 'testsynth', 'testsignals'];
        const available: string[] = [];

        for (const dspName of knownDSPs) {
            try {
                // DSPファイルの存在確認
                const response = await fetch(`${basePath}/${dspName}.dsp`);
                if (response.ok) {
                    available.push(dspName);
                }
            } catch (error) {
                console.warn(`⚠️ DSP not available: ${dspName}`, error);
            }
        }

        return available;
    }
}

// シングルトンインスタンスをエクスポート
export const faustWasmLoader = FaustWasmLoader.getInstance();
