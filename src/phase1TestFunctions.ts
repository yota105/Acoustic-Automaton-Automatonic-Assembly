// Phase 1テスト用: Faust WASM統合のテスト関数
// 開発者コンソールで直接実行してFaust WASM機能をテストできます

import { faustWasmLoader } from './audio/dsp/faustWasmLoader';
import { scanAndRegisterDSPFiles, createEffectInstance, listRegisteredEffects } from './audio/effects/effectRegistry';
import { trackLifecycleManager } from './audio/trackLifecycleManager';
import { listTracks } from './audio/tracks';

// Phase 1機能テスト用のグローバル関数群
declare global {
    interface Window {
        testFaustWasmIntegration: () => Promise<void>;
        testEffectRegistryV2: () => Promise<void>;
        showRegisteredEffects: () => void;
        testMysynthCreation: () => Promise<void>;
        testSimpleSynth: () => Promise<void>;
        testTrackLifecycleManager: () => Promise<void>;
        diagnoseAudioConnections: () => void;
        diagnoseTrackArrayState: () => void;
        trackLifecycleManager: typeof trackLifecycleManager;
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

/**
 * Track Lifecycle Manager テスト
 */
window.testTrackLifecycleManager = async function () {
    console.log('🧪 Testing Track Lifecycle Manager...');

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

        // TrackLifecycleManagerを初期化
        trackLifecycleManager.setAudioContext(ctx);
        console.log('🏗️ TrackLifecycleManager initialized');

        // DSPスキャンを実行
        await scanAndRegisterDSPFiles();

        // 1. testsynthからTrackを作成
        console.log('1️⃣ Creating track from testsynth effect...');
        const testsynthResult = await trackLifecycleManager.createTrackFromEffect('testsynth', {
            name: 'Test Synth Track',
            initialVolume: 0.8,
            dspConfig: {
                effectRefId: 'testsynth',
                parameters: {
                    freq: 880, // A5
                    gain: 0.1
                }
            }
        });

        if (testsynthResult.success) {
            console.log('✅ testsynth Track created:', testsynthResult.track);
            console.log('🎵 Should hear 880Hz sawtooth wave');
        } else {
            console.error('❌ testsynth Track creation failed:', testsynthResult.error);
        }

        // 2. mysynthからTrackを作成  
        console.log('2️⃣ Creating track from mysynth effect...');
        const mysynthResult = await trackLifecycleManager.createTrackFromEffect('mysynth', {
            name: 'My Synth Track',
            initialVolume: 0.5,
            dspConfig: {
                effectRefId: 'mysynth',
                parameters: {
                    freq: 660, // E5
                    gain: 0.15
                }
            }
        });

        if (mysynthResult.success) {
            console.log('✅ mysynth Track created:', mysynthResult.track);
            console.log('💡 mysynth requires input - connect mic or audio source');
        } else {
            console.error('❌ mysynth Track creation failed:', mysynthResult.error);
        }

        // 3. Track統計情報表示
        const stats = trackLifecycleManager.getStats();
        console.log('📊 Track Lifecycle Manager Stats:', stats);

        // 4. Track一覧表示
        console.log('📋 Current tracks:');
        const tracks = window.trackLifecycleManager.getStats();
        console.table(tracks);

        // 5秒後にtestsynthトラックを破棄
        setTimeout(async () => {
            if (testsynthResult.success) {
                console.log('⏰ Auto-dismissing testsynth track in 5 seconds...');
                const dismissed = await trackLifecycleManager.dismissTrackSafely(testsynthResult.track.id);
                if (dismissed) {
                    console.log('🗑️ testsynth Track safely dismissed');
                } else {
                    console.error('❌ Failed to dismiss testsynth Track');
                }
            }
        }, 5000);

        console.log('✅ Track Lifecycle Manager test completed!');
        console.log('💡 Check the track statistics and audio output');

    } catch (error) {
        console.error('❌ Track Lifecycle Manager test failed:', error);
    }
};

/**
 * 音声接続診断関数
 */
window.diagnoseAudioConnections = function () {
    console.log('🔍 Diagnosing audio connections...');

    // 1. AudioContext状態確認
    if (window.audioCtx) {
        console.log(`📱 AudioContext state: ${window.audioCtx.state}`);
        console.log(`📱 AudioContext sampleRate: ${window.audioCtx.sampleRate}`);
    } else {
        console.warn('⚠️ AudioContext not found');
        return;
    }

    // 2. busManager確認
    if (window.busManager) {
        console.log('🚌 busManager found');
        console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.busManager)));

        try {
            const effectsInput = window.busManager.getEffectsInputNode();
            console.log('🔌 effectsInput node:', effectsInput);
        } catch (error) {
            console.error('❌ Failed to get effectsInput:', error);
        }
    } else {
        console.warn('⚠️ busManager not found');
    }

    // 3. Track診断
    import('./audio/tracks').then(({ listTracks, diagnoseTrackVolume }) => {
        const tracks = listTracks();
        console.log(`📋 Found ${tracks.length} tracks`);

        tracks.forEach(track => {
            console.log(`\n🎵 Track ${track.id}:`);
            console.log(`   Name: ${track.name}`);
            console.log(`   Kind: ${track.kind}`);
            console.log(`   Volume: ${track.userVolume} -> gain: ${track.volumeGain.gain.value}`);
            console.log(`   Input: ${track.inputNode.constructor.name}`);
            console.log(`   VolumeGain: ${track.volumeGain.constructor.name}`);

            // 接続確認
            try {
                if (track.inputNode && 'numberOfOutputs' in track.inputNode) {
                    console.log(`   Input outputs: ${track.inputNode.numberOfOutputs}`);
                }
                if (track.volumeGain) {
                    console.log(`   VolumeGain inputs: ${track.volumeGain.numberOfInputs}`);
                    console.log(`   VolumeGain outputs: ${track.volumeGain.numberOfOutputs}`);
                }
            } catch (error) {
                console.warn('   Connection check failed:', error);
            }
        });

        // 全体診断実行
        diagnoseTrackVolume();
    });

    // 4. outputGainNode確認
    if (window.outputGainNode) {
        console.log('🔊 outputGainNode found');
        console.log(`   gain: ${window.outputGainNode.gain.value}`);
    } else {
        console.warn('⚠️ outputGainNode not found');
    }

    console.log('🔍 Audio diagnosis completed');

    // 5. TrackLifecycleManager特別診断
    console.log('\n🔧 TrackLifecycleManager specific diagnosis:');
    if (window.trackLifecycleManager) {
        const stats = window.trackLifecycleManager.getStats();
        console.log('📊 TrackLifecycleManager stats:', stats);

        // 最新のTrackを直接テスト
        import('./audio/tracks').then(({ listTracks }) => {
            const allTracks = listTracks();
            const latestTrack = allTracks[allTracks.length - 1];

            if (latestTrack && latestTrack.kind === 'faust') {
                console.log('\n🧪 Testing latest faust track audio path...');
                console.log(`   Track ID: ${latestTrack.id}`);
                console.log(`   Volume chain: ${latestTrack.userVolume} -> ${latestTrack.volumeGain.gain.value}`);

                // 直接destination接続テスト
                try {
                    // 既存接続を切断
                    latestTrack.volumeGain.disconnect();
                    // 直接destination接続
                    if (window.audioCtx) {
                        latestTrack.volumeGain.connect(window.audioCtx.destination);
                        console.log('🔊 Connected latest track directly to destination');
                        console.log('💡 If you hear sound now, the problem is busManager connection');

                        // 5秒後に元に戻す
                        setTimeout(() => {
                            latestTrack.volumeGain.disconnect();
                            if (window.busManager) {
                                latestTrack.volumeGain.connect(window.busManager.getEffectsInputNode());
                                console.log('🔄 Restored busManager connection');
                            }
                        }, 5000);
                    }
                } catch (error) {
                    console.error('❌ Direct connection test failed:', error);
                }
            }
        });
    }
};

// Track配列の詳細診断
export function diagnoseTrackArrayState(): void {
    console.log('=== Track Array State Diagnosis ===');

    // tracks.ts のリスト
    const tracksList = listTracks();
    console.log(`📊 tracks.ts listTracks() count: ${tracksList.length}`);
    tracksList.forEach((track, index) => {
        console.log(`  [${index}] ID: ${track.id}, Kind: ${track.kind}, Name: ${track.name}`);
        console.log(`      Input node: ${track.inputNode?.constructor.name || 'None'}`);
        console.log(`      Output node: ${track.outputNode?.constructor.name || 'None'}`);
        console.log(`      Muted: ${track.muted}, Solo: ${track.solo}`);
    });

    // TrackLifecycleManager の統計
    const stats = window.trackLifecycleManager.getStats();
    console.log(`📈 TrackLifecycleManager stats:`, stats);

    // TrackLifecycleManagerの内部状態確認
    console.log(`🔄 Pending creations: ${stats.pendingCreations}`);
    console.log(`🎯 Total tracks (from stats): ${stats.totalTracks}`);

    // 配列の直接アクセス確認（内部的に）
    console.log('📍 Direct array access check:');
    const directTracks = listTracks();
    console.log(`  - Direct call result length: ${directTracks.length}`);

    if (tracksList.length !== stats.totalTracks) {
        console.error(`🚨 MISMATCH DETECTED!`);
        console.error(`  listTracks(): ${tracksList.length} tracks`);
        console.error(`  getStats(): ${stats.totalTracks} tracks`);

        // 可能な原因の調査
        console.log('🔍 Investigating possible causes...');

        // タイミング問題のチェック
        setTimeout(() => {
            const delayedList = listTracks();
            console.log(`⏱️ After 100ms delay - tracks count: ${delayedList.length}`);
        }, 100);
    } else {
        console.log('✅ Track count consistency: OK');
    }

    console.log('=== Track Array Diagnosis Complete ===');
}

// グローバル関数として登録
(window as any).diagnoseTrackArrayState = diagnoseTrackArrayState;

// Phase 1完了通知
console.log('🚀 Phase 1 Test Functions loaded!');
console.log('📝 Available test functions:');
console.log('  - window.testFaustWasmIntegration()');
console.log('  - window.testEffectRegistryV2()');
console.log('  - window.showRegisteredEffects()');
console.log('  - window.testMysynthCreation()');
console.log('  - window.testSimpleSynth()');
console.log('  - window.testTrackLifecycleManager() [NEW]');
console.log('  - window.diagnoseAudioConnections() [DIAGNOSTIC]');
console.log('  - window.diagnoseTrackArrayState() [DIAGNOSTIC]');
console.log('💡 Run any of these in the browser console to test Phase 1 implementation');
