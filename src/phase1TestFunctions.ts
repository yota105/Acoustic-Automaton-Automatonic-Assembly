// Phase 1テスト用: Faust WASM統合のテスト関数
// 開発者コンソールで直接実行してFaust WASM機能をテストできます

import { faustWasmLoader } from './audio/dsp/faustWasmLoader';
import { scanAndRegisterDSPFiles, createEffectInstance, listRegisteredEffects } from './audio/effects/effectRegistry';

// Phase 1機能テスト用のグローバル関数群
declare global {
    interface Window {
        testFaustWasmIntegration: () => Promise<void>;
        testEffectRegistryV2: () => Promise<void>;
        showRegisteredEffects: () => void;
        testMysynthCreation: () => Promise<void>;
        testSimpleSynth: () => Promise<void>;
    }
}

/**
 * Faust WASM Loader単体テスト
 */
window.testFaustWasmIntegration = async function () {
    console.log('🧪 Testing Faust WASM Integration...');

    try {
        if (!window.audioCtx) {
            console.log('📋 AudioContext not found, initializing...');
            window.audioCtx = new AudioContext();
        }

        const ctx = window.audioCtx;

        // 1. DSPファイルスキャン
        console.log('1️⃣ Scanning available DSP files...');
        const availableDSPs = await faustWasmLoader.scanAvailableDSP();
        console.log('Available DSPs:', availableDSPs);

        if (availableDSPs.length === 0) {
            console.warn('⚠️ No DSP files found');
            return;
        }

        // 2. Faust WASM初期化
        console.log('2️⃣ Initializing Faust WASM...');
        await faustWasmLoader.initializeFaustWasm();

        // 3. mysynth.dspのロード
        if (availableDSPs.includes('mysynth')) {
            console.log('3️⃣ Loading mysynth.dsp...');
            const mysynthNode = await faustWasmLoader.loadFaustNode(ctx, 'mysynth');
            console.log('✅ mysynth node created:', mysynthNode);

            // パラメータ情報取得
            const params = faustWasmLoader.getParameterInfo('mysynth');
            console.log('📋 mysynth parameters:', params);

            // 簡単なパラメータテスト
            if (typeof (mysynthNode as any).setParamValue === 'function') {
                console.log('4️⃣ Testing parameter control...');
                (mysynthNode as any).setParamValue('/mysynth/freq', 440);
                console.log('✅ Set frequency to 440Hz');
            }

            // 一時的にグローバルに保存（テスト用）
            (window as any).testMysynthNode = mysynthNode;
        }

        console.log('✅ Faust WASM Integration test completed successfully!');
    } catch (error) {
        console.error('❌ Faust WASM Integration test failed:', error);
    }
};

/**
 * EffectRegistry v2テスト
 */
window.testEffectRegistryV2 = async function () {
    console.log('🧪 Testing EffectRegistry v2...');

    try {
        if (!window.audioCtx) {
            window.audioCtx = new AudioContext();
        }

        const ctx = window.audioCtx;

        // 1. DSP自動スキャン・登録
        console.log('1️⃣ Scanning and registering DSP files...');
        await scanAndRegisterDSPFiles();

        // 2. 登録されたエフェクト一覧表示
        console.log('2️⃣ Registered effects:');
        const effects = listRegisteredEffects();
        console.table(effects);

        // 3. mysynthエフェクトインスタンス作成テスト
        console.log('3️⃣ Creating mysynth effect instance...');
        const mysynthInstance = await createEffectInstance('mysynth', ctx);
        console.log('✅ mysynth instance created:', mysynthInstance);

        // パラメータテスト
        if (mysynthInstance.controller) {
            console.log('4️⃣ Testing parameter control via controller...');
            mysynthInstance.controller.setParam('freq', 550);
            console.log('✅ Set frequency to 550Hz via controller');
        }

        // 一時的にグローバルに保存（テスト用）
        (window as any).testMysynthInstance = mysynthInstance;

        console.log('✅ EffectRegistry v2 test completed successfully!');
    } catch (error) {
        console.error('❌ EffectRegistry v2 test failed:', error);
    }
};

/**
 * 登録されたエフェクト一覧表示
 */
window.showRegisteredEffects = function () {
    const effects = listRegisteredEffects();
    console.table(effects);
    return effects;
};

/**
 * mysynthの作成とオーディオ接続テスト
 */
window.testMysynthCreation = async function () {
    console.log('🧪 Testing mysynth creation and audio connection...');

    try {
        if (!window.audioCtx) {
            window.audioCtx = new AudioContext();
        }

        const ctx = window.audioCtx;

        // AudioContextが suspended の場合は resume
        if (ctx.state === 'suspended') {
            await ctx.resume();
            console.log('📢 AudioContext resumed');
        }

        // mysynthインスタンス作成
        const mysynthInstance = await createEffectInstance('mysynth', ctx);
        console.log('✅ mysynth instance created');

        // outputGainNodeに接続
        if (window.outputGainNode) {
            mysynthInstance.node.connect(window.outputGainNode);
            console.log('🔊 Connected mysynth to output');
        } else {
            // outputGainNodeがない場合、直接destinationに接続
            mysynthInstance.node.connect(ctx.destination);
            console.log('🔊 Connected mysynth directly to destination');
        }

        // パラメータ設定してテスト音再生
        if (mysynthInstance.controller) {
            mysynthInstance.controller.setParam('freq', 440);
            mysynthInstance.controller.setParam('gain', 0.1); // 小さな音量
            console.log('🎵 Set test parameters (440Hz, gain=0.1)');
        }

        console.log('✅ mysynth audio test setup completed!');
        console.log('💡 You should now hear a 440Hz sawtooth wave');

        // 一時的にグローバルに保存
        (window as any).testConnectedMysynth = mysynthInstance;

    } catch (error) {
        console.error('❌ mysynth creation test failed:', error);
    }
};

/**
 * シンプルなテストシンセサイザーでの音声テスト
 */
window.testSimpleSynth = async function () {
    console.log('🧪 Testing simple test synthesizer...');

    try {
        if (!window.audioCtx) {
            window.audioCtx = new AudioContext();
        }

        const ctx = window.audioCtx;

        // AudioContextが suspended の場合は resume
        if (ctx.state === 'suspended') {
            await ctx.resume();
            console.log('📢 AudioContext resumed');
        }

        // testsynthが利用可能かチェック
        const availableDSPs = await faustWasmLoader.scanAvailableDSP();
        if (!availableDSPs.includes('testsynth')) {
            console.warn('⚠️ testsynth.dsp not found, falling back to direct Faust loading');

            // 直接testsynthをロード
            const testsynthNode = await faustWasmLoader.loadFaustNode(ctx, 'testsynth');
            testsynthNode.connect(ctx.destination);

            // パラメータ設定
            testsynthNode.setParamValue('/testsynth/freq', 440);
            testsynthNode.setParamValue('/testsynth/gain', 0.1);

            console.log('✅ Direct testsynth created and connected');
            console.log('🎵 Should hear 440Hz sawtooth wave (no input required)');

            (window as any).testSimpleSynthNode = testsynthNode;
            return;
        }

        // EffectRegistry経由でtestsynthインスタンス作成
        await scanAndRegisterDSPFiles();

        // 登録されたエフェクトを確認
        const registeredEffects = listRegisteredEffects();
        console.log('📋 Registered effects after scan:', registeredEffects.map(e => e.refId));

        const testsynthInstance = await createEffectInstance('testsynth', ctx);
        console.log('✅ testsynth instance created');

        // 音声接続
        testsynthInstance.node.connect(ctx.destination);
        console.log('🔊 Connected testsynth to destination');

        // パラメータ設定
        if (testsynthInstance.controller) {
            testsynthInstance.controller.setParam('freq', 440);
            testsynthInstance.controller.setParam('gain', 0.1);
            console.log('🎵 Set test parameters (440Hz, gain=0.1)');
        }

        console.log('✅ Simple synth test completed!');
        console.log('💡 You should now hear a 440Hz sawtooth wave (no input required)');

        // 一時的にグローバルに保存
        (window as any).testSimpleSynthInstance = testsynthInstance;

    } catch (error) {
        console.error('❌ Simple synth test failed:', error);
    }
};

// Phase 1完了通知
console.log('🚀 Phase 1 Test Functions loaded!');
console.log('📝 Available test functions:');
console.log('  - window.testFaustWasmIntegration()');
console.log('  - window.testEffectRegistryV2()');
console.log('  - window.showRegisteredEffects()');
console.log('  - window.testMysynthCreation()');
console.log('  - window.testSimpleSynth()');
console.log('💡 Run any of these in the browser console to test Phase 1 implementation');
