/**
 * MusicalTimeManager テスト関数群
 * 音楽的時間軸制御システムの動作確認・デバッグ用
 */

import { getMusicalTimeManager, MusicalTime, PerformanceEvent, CueEvent } from './engine/timing/musicalTimeManager';
import { ensureBaseAudio } from './engine/audio/core/audioCore';

/**
 * メトロノームユーティリティ関数
 */
export const MetronomeUtils = {
    /**
     * メトロノームを有効化
     */
    enable(): boolean {
        const manager = getMusicalTimeManager();
        if (!manager) {
            console.error('❌ MusicalTimeManager not initialized');
            return false;
        }
        manager.enableMetronome();
        console.log('🥁 Metronome enabled');
        return true;
    },

    /**
     * メトロノームを無効化
     */
    disable(): boolean {
        const manager = getMusicalTimeManager();
        if (!manager) {
            console.error('❌ MusicalTimeManager not initialized');
            return false;
        }
        manager.disableMetronome();
        console.log('🔇 Metronome disabled');
        return true;
    },

    /**
     * メトロノームの音量を設定
     */
    setVolume(volume: number): boolean {
        const manager = getMusicalTimeManager();
        if (!manager) {
            console.error('❌ MusicalTimeManager not initialized');
            return false;
        }
        manager.setMetronomeVolume(volume);
        console.log(`🔊 Metronome volume set to ${(volume * 100).toFixed(0)}%`);
        return true;
    },

    /**
     * メトロノームテストパターンを再生
     */
    playTest(): boolean {
        const manager = getMusicalTimeManager();
        if (!manager) {
            console.error('❌ MusicalTimeManager not initialized');
            return false;
        }
        manager.playMetronomeTest();
        return true;
    },

    /**
     * メトロノームの状態を切り替え
     */
    toggle(): boolean {
        const manager = getMusicalTimeManager();
        if (!manager) {
            console.error('❌ MusicalTimeManager not initialized');
            return false;
        }

        // 簡易的な状態管理（実際のメトロノーム状態を取得する方法がないため）
        const currentlyEnabled = (window as any).metronomeState?.enabled || false;

        if (currentlyEnabled) {
            this.disable();
            (window as any).metronomeState = { enabled: false };
        } else {
            this.enable();
            (window as any).metronomeState = { enabled: true };
        }

        return true;
    }
};

// ==== テスト共通設定 / 自動メトロノーム制御追加 ====
const TEST_ENV_SETTINGS = {
    autoEnableMetronome: true,          // 他テストでも自動でメトロノームを鳴らす
    autoStartMusicalTime: true,         // 必要なら自動で mtm.start() する
    defaultMetronomeVolume: 0.35        // 共通デフォルト音量
};

function ensureMetronomeForTest(context: string) {
    const manager = getMusicalTimeManager();
    if (!manager) return;
    if (TEST_ENV_SETTINGS.autoEnableMetronome) {
        manager.enableMetronome();
        manager.setMetronomeVolume(TEST_ENV_SETTINGS.defaultMetronomeVolume);
    }
    if (TEST_ENV_SETTINGS.autoStartMusicalTime) {
        try {
            // 連続呼び出しでも問題ない前提で start() を呼ぶ
            manager.start();
        } catch (e) {
            console.warn(`[ensureMetronomeForTest] start() skipped (${context}):`, e);
        }
    }
}

/**
 * クリーンな測定環境をセットアップ（シンプルテスト用）
 */
function setupCleanTestEnvironment(manager: any) {
    // すべてのコールバックをクリア（測定への干渉を避けるため）
    manager.onBeat = undefined;
    manager.onCue = undefined;
    manager.onEvent = undefined;

    // イベントキューをクリア
    if (manager.scheduledEvents) {
        manager.scheduledEvents.clear();
    }
    if (manager.cueEvents) {
        manager.cueEvents.clear();
    }
}
// ==== ここまで追加 ====

/**
 * MusicalTimeManagerの自動初期化
 */
async function ensureMusicalTimeManagerReady(): Promise<boolean> {
    let timeManager = getMusicalTimeManager();

    if (!timeManager) {
        console.log('🔧 MusicalTimeManager not found, initializing Base Audio...');
        try {
            await ensureBaseAudio();
            timeManager = getMusicalTimeManager();

            if (timeManager) {
                console.log('✅ MusicalTimeManager successfully initialized');
                return true;
            } else {
                console.error('❌ Failed to initialize MusicalTimeManager');
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to initialize Base Audio:', error);
            return false;
        }
    }

    return true;
}

/**
 * MusicalTimeManager基本動作テスト
 */
export function testMusicalTimeManager(): void {
    console.log('🎼 Testing MusicalTimeManager...');

    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized. Please click "🔊 Enable Test Signals" button first.');
        console.log('💡 Steps to initialize:');
        console.log('   1. Click "🔊 Enable Test Signals" button');
        console.log('   2. Wait for "✅ Test Signals Ready" confirmation');
        console.log('   3. Run tests again');
        return;
    }

    // 追加: 自動メトロノーム & 自動開始
    ensureMetronomeForTest('testMusicalTimeManager');

    // 現在の状態表示
    const status = timeManager.getStatus();
    console.log('📊 Current Status:', status);

    // 基本的な拍子コールバックテスト
    timeManager.onBeat((bar, beat) => {
        if (bar <= 2 && beat <= 4) { // 最初の2小節のみログ出力
            console.log(`🎵 Beat: Bar ${bar}, Beat ${beat}`);
        }
    });

    // 簡単なキューイベントのテスト
    timeManager.onCue((cue) => {
        console.log(`🎯 Cue executed: ${cue.name} - ${cue.message}`);
    });

    console.log('✅ MusicalTimeManager test callbacks set up');
    console.log('💡 Use mtm.start() to begin musical time, mtm.stop() to stop');
}

/**
 * 音楽的時間変換テスト
 */
export function testMusicalTimeConversion(): void {
    console.log('🔄 Testing Musical Time Conversion...');

    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized. Please click "🔊 Enable Test Signals" button first.');
        return;
    }

    // 追加: 自動メトロノーム & 自動開始
    ensureMetronomeForTest('testMusicalTimeConversion');

    // テスト用時間定義
    const testTimes: MusicalTime[] = [
        { type: 'absolute', seconds: 5.0 },
        { type: 'musical', bars: 4, beats: 2 },
        { type: 'musical', bars: 8, beats: 1, subdivisions: 2 },
        { type: 'tempo_relative', beats: 16 },
    ];

    console.log('⏱️ Time Conversion Results (120 BPM, 4/4):');
    testTimes.forEach((time, index) => {
        const absoluteTime = timeManager.musicalTimeToAbsolute(time);
        console.log(`${index + 1}. ${JSON.stringify(time)} → ${absoluteTime.toFixed(2)}s`);
    });
}

/**
 * パフォーマンスイベントスケジューリングテスト
 */
export function testPerformanceEventScheduling(): void {
    console.log('📅 Testing Performance Event Scheduling...');

    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized. Please click "🔊 Enable Test Signals" button first.');
        return;
    }

    // 追加: 自動メトロノーム & 自動開始
    ensureMetronomeForTest('testPerformanceEventScheduling');

    // テスト用イベント定義
    const events: PerformanceEvent[] = [
        {
            id: 'start_test',
            time: { type: 'absolute', seconds: 2 },
            type: 'audio',
            action: 'test_signal_start',
            description: '2秒後にテスト信号開始'
        },
        {
            id: 'bar_4_entrance',
            time: { type: 'musical', bars: 4, beats: 1 },
            type: 'cue',
            action: 'performer_entrance',
            description: '4小節目で奏者エントリー'
        },
        {
            id: 'trigger_test',
            time: { type: 'trigger_wait', triggerId: 'manual_trigger' },
            type: 'visual',
            action: 'effect_change',
            description: '手動トリガー待ち'
        }
    ];

    // イベントコールバック設定
    timeManager.onEvent((event) => {
        console.log(`🎬 Event executed: ${event.id} - ${event.action}`);
        console.log(`   Description: ${event.description}`);
    });

    // イベントスケジューリング
    events.forEach(event => {
        timeManager.scheduleEvent(event);
    });

    console.log('✅ Performance events scheduled');
    console.log('💡 Use mtm.start() to begin execution');
    console.log('💡 Use mtm.triggerEvent("manual_trigger") to fire trigger event');
}

/**
 * キューシステムテスト
 */
export function testCueSystem(): void {
    console.log('🎯 Testing Cue System...');

    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized. Please click "🔊 Enable Test Signals" button first.');
        return;
    }

    // 追加: 自動メトロノーム & 自動開始
    ensureMetronomeForTest('testCueSystem');

    // テスト用キュー定義
    const cues: CueEvent[] = [
        {
            id: 'preparation',
            name: 'Preparation Phase',
            time: { type: 'absolute', seconds: 1 },
            target: 'all',
            message: '準備してください',
            priority: 'normal'
        },
        {
            id: 'entrance_cue',
            name: 'Performer Entrance',
            time: { type: 'musical', bars: 2, beats: 3 },
            target: 'performer',
            message: '次の小節でエントリー',
            priority: 'high'
        },
        {
            id: 'conductor_cue_test',
            name: 'Conductor Cue Test',
            time: { type: 'conductor_cue', cueId: 'section_change' },
            target: 'operator',
            message: '指揮者のキューで開始',
            priority: 'critical'
        }
    ];

    // キューコールバック設定
    timeManager.onCue((cue) => {
        console.log(`🎯 [${cue.priority.toUpperCase()}] ${cue.name}`);
        console.log(`   Target: ${cue.target}`);
        console.log(`   Message: ${cue.message}`);
    });

    // キュースケジューリング
    cues.forEach(cue => {
        timeManager.scheduleCue(cue);
    });

    console.log('✅ Cue events scheduled');
    console.log('💡 Use mtm.conductorCue("section_change") to fire conductor cue');
}

/**
 * 複雑拍子テスト
 */
export function testComplexTimeSignatures(): void {
    console.log('🎼 Testing Complex Time Signatures...');

    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized. Please click "🔊 Enable Test Signals" button first.');
        return;
    }

    // メトロノームを有効化して拍子の変化を聞こえるように
    console.log('🥁 Enabling metronome for complex time signature demo...');
    MetronomeUtils.enable();
    MetronomeUtils.setVolume(0.6);

    // 7/8拍子に変更
    timeManager.setTempo({
        bpm: 140,
        numerator: 7,
        denominator: 8,
        subdivision: 8
    });

    console.log('🎵 Changed to 7/8 at 140 BPM');
    console.log('🎯 Listen to the metronome pattern - downbeat every 7 beats');

    // 複雑拍子での音楽的時間テスト
    const complexTime: MusicalTime = {
        type: 'musical',
        bars: 3,
        beats: 5,
        subdivisions: 4
    };

    const absoluteTime = timeManager.musicalTimeToAbsolute(complexTime);
    console.log(`🔄 3小節5拍4細分 (7/8) = ${absoluteTime.toFixed(2)}秒`);

    // 4/4拍子に戻す
    setTimeout(() => {
        timeManager.setTempo({
            bpm: 120,
            numerator: 4,
            denominator: 4
        });
        console.log('🎵 Changed back to 4/4 at 120 BPM');
        console.log('🎯 Notice the difference in metronome pattern');

        // テスト完了後メトロノームを無効化
        setTimeout(() => {
            MetronomeUtils.disable();
            console.log('✅ Complex time signature test completed');
        }, 5000);
    }, 8000);
}

/**
 * フルパフォーマンステスト（総合デモ）
 */
export function testFullPerformance(): void {
    console.log('🎭 Starting Full Performance Test...');

    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized. Please click "🔊 Enable Test Signals" button first.');
        return;
    }

    // メトロノームを有効化
    console.log('🥁 Enabling metronome for performance...');
    MetronomeUtils.enable();
    MetronomeUtils.setVolume(0.4);

    // パフォーマンス記述例
    const performanceScript = {
        title: "MusicalTimeManager Demo Performance",
        duration: "30s",

        events: [
            {
                id: 'intro',
                time: { type: 'absolute', seconds: 1 },
                type: 'cue',
                action: 'show_message',
                parameters: { message: 'パフォーマンス開始' }
            },
            {
                id: 'metronome_start',
                time: { type: 'musical', bars: 1, beats: 1 },
                type: 'audio',
                action: 'start_metronome',
                parameters: { volume: 0.3 }
            },
            {
                id: 'section_a',
                time: { type: 'musical', bars: 4, beats: 1 },
                type: 'cue',
                action: 'section_change',
                parameters: { section: 'A', instructions: 'dolce' }
            },
            {
                id: 'tempo_change',
                time: { type: 'musical', bars: 8, beats: 1 },
                type: 'control',
                action: 'change_tempo',
                parameters: { bpm: 90 }
            },
            {
                id: 'finale',
                time: { type: 'musical', bars: 12, beats: 1 },
                type: 'cue',
                action: 'finale',
                parameters: { message: 'rit. - 終了' }
            }
        ]
    };

    // イベント・キューコールバック設定
    timeManager.onEvent((event) => {
        console.log(`🎬 [${event.type}] ${event.action}`, event.parameters || '');

        // テンポ変更イベントの実際の処理
        if (event.action === 'change_tempo' && event.parameters?.bpm) {
            timeManager.setTempo({
                bpm: event.parameters.bpm,
                numerator: 4,
                denominator: 4
            });
        }
    });

    timeManager.onBeat((bar, beat) => {
        if (bar <= 12 && beat === 1) { // 各小節の1拍目のみ
            console.log(`📍 Bar ${bar}`);
        }
    });

    // イベントスケジューリング
    performanceScript.events.forEach(event => {
        timeManager.scheduleEvent(event as PerformanceEvent);
    });

    console.log('✅ Full performance script loaded with metronome');
    console.log('💡 Use mtm.start() to begin the 30-second demo performance');
    console.log('💡 Metronome will provide audio feedback for beats');
}

/**
 * フルパフォーマンステスト（自動初期化付き）
 */
export async function testFullPerformanceWithInit(): Promise<void> {
    console.log('🎭 Starting Full Performance Test (with auto-init)...');

    const ready = await ensureMusicalTimeManagerReady();
    if (!ready) {
        console.error('❌ Failed to initialize MusicalTimeManager');
        return;
    }

    // 初期化完了後、通常のフルパフォーマンステストを実行
    testFullPerformance();
}

/**
 * グローバルヘルパー関数の設定
 */
export function setupMusicalTimeManagerHelpers(): void {
    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.warn('MusicalTimeManager not initialized, helpers not available');
        console.log('💡 Please click "🔊 Enable Test Signals" button first to initialize MusicalTimeManager');
        return;
    }

    // グローバルヘルパー関数
    (window as any).mtm = {
        start: () => timeManager.start(),
        stop: () => timeManager.stop(),
        pause: () => timeManager.pause(),
        resume: () => timeManager.resume(),
        status: () => timeManager.getStatus(),
        debug: () => timeManager.debug(),
        trigger: (id: string) => timeManager.triggerEvent(id),
        cue: (id: string) => timeManager.conductorCue(id),
        tempo: (bpm: number, num: number = 4, den: number = 4) => {
            timeManager.setTempo({ bpm, numerator: num, denominator: den });
        },
        position: () => timeManager.getCurrentMusicalPosition(),
        time: () => timeManager.getCurrentAbsoluteTime(),
        metronome: {
            enable: () => MetronomeUtils.enable(),
            disable: () => MetronomeUtils.disable(),
            toggle: () => MetronomeUtils.toggle(),
            volume: (vol: number) => MetronomeUtils.setVolume(vol),
            test: () => MetronomeUtils.playTest()
        }
    };

    // メトロノームユーティリティもグローバルに
    (window as any).MetronomeUtils = MetronomeUtils;

    console.log('✅ Global mtm helpers available:');
    console.log('   mtm.start() - 演奏開始');
    console.log('   mtm.stop() - 演奏停止');
    console.log('   mtm.status() - 現在の状態');
    console.log('   mtm.debug() - デバッグ情報');
    console.log('   mtm.trigger(id) - トリガー発火');
    console.log('   mtm.cue(id) - 指揮者キュー');
    console.log('   mtm.tempo(bpm, num, den) - テンポ変更');
    console.log('   mtm.position() - 現在の音楽的位置');
    console.log('   mtm.time() - 現在の絶対時間');
    console.log('   mtm.metronome.enable() - メトロノーム有効化');
    console.log('   mtm.metronome.disable() - メトロノーム無効化');
    console.log('   mtm.metronome.toggle() - メトロノーム切り替え');
    console.log('   mtm.metronome.volume(0-1) - メトロノーム音量');
    console.log('   mtm.metronome.test() - メトロノームテスト');
    console.log('   MetronomeUtils.* - メトロノームユーティリティ関数');
}

/**
 * メトロノーム使用例の表示
 */
export function showMetronomeUsage(): void {
    console.log('🥁 Metronome Usage Examples:');
    console.log('=====================================');
    console.log('');
    console.log('1. Basic Controls:');
    console.log('   MetronomeUtils.enable()     // メトロノーム有効化');
    console.log('   MetronomeUtils.disable()    // メトロノーム無効化');
    console.log('   MetronomeUtils.toggle()     // メトロノーム切り替え');
    console.log('   MetronomeUtils.setVolume(0.5) // 音量設定');
    console.log('   MetronomeUtils.playTest()   // テストパターン再生');
    console.log('');
    console.log('2. Using with musical tests:');
    console.log('   // テスト前にメトロノーム有効化');
    console.log('   MetronomeUtils.enable();');
    console.log('   mtm.start(); // 音楽的時間開始');
    console.log('   // メトロノームが拍を音で示します');
    console.log('');
    console.log('3. UI Controls:');
    console.log('   - "🔇 Metronome Off/🥁 Metronome On" ボタンで切り替え');
    console.log('   - 音量スライダーで音量調整');
    console.log('   - "🥁 Metronome Test" ボタンでテストパターン');
    console.log('');
    console.log('4. Beat Types (音の違い):');
    console.log('   🔴 Downbeat (小節頭) - 880Hz, 最大音量, 長い音');
    console.log('   🟡 Strong Beat (強拍) - 660Hz, 中音量, 中長音');
    console.log('   🟢 Weak Beat (弱拍) - 440Hz, 小音量, 短音');
    console.log('   🔵 Subdivision (細分化) - 330Hz, 最小音量, 最短音');
    console.log('');
    console.log('💡 Try: MetronomeUtils.enable() then mtm.start() to hear the beats!');
}

// 全テスト実行（自動初期化付き）
export async function runAllMusicalTimeTestsWithInit(): Promise<void> {
    console.log('🚀 Running All MusicalTimeManager Tests (with auto-init)...');
    console.log('===============================================');

    const ready = await ensureMusicalTimeManagerReady();
    if (!ready) {
        console.error('❌ Failed to initialize MusicalTimeManager');
        return;
    }

    // 追加: 最初にメトロノームを確実に立ち上げ
    ensureMetronomeForTest('runAllMusicalTimeTestsWithInit:initial');

    testMusicalTimeManager();
    setTimeout(() => testMusicalTimeConversion(), 500);
    setTimeout(() => testPerformanceEventScheduling(), 1000);
    setTimeout(() => testCueSystem(), 1500);
    setTimeout(() => testComplexTimeSignatures(), 2000);
    setTimeout(() => setupMusicalTimeManagerHelpers(), 2500);
    setTimeout(() => testMetronomeWithMeasurement(), 3000);

    // 追加: ヘルパー設定後に再確認（開始されていなければ再start）
    setTimeout(() => ensureMetronomeForTest('runAllMusicalTimeTestsWithInit:postHelpers'), 3200);

    console.log('✅ All tests queued. Check console output over the next few seconds.');
    console.log('💡 Try testFullPerformance() for a comprehensive demo');
    console.log('⏱️ Beat timing measurement will start after 3 seconds');
}

// 全テスト実行
export function runAllMusicalTimeTests(): void {
    console.log('🚀 Running All MusicalTimeManager Tests...');
    console.log('=====================================');

    // MusicalTimeManagerの初期化確認
    const timeManager = getMusicalTimeManager();
    if (!timeManager) {
        console.error('❌ MusicalTimeManager not initialized!');
        console.log('💡 Required steps:');
        console.log('   1. Click "🔊 Enable Test Signals" button');
        console.log('   2. Wait for "✅ Test Signals Ready" confirmation');
        console.log('   3. Run tests again');
        console.log('');
        console.log('🔧 Alternative: You can also initialize manually with ensureBaseAudio()');
        return;
    }

    testMusicalTimeManager();
    setTimeout(() => testMusicalTimeConversion(), 500);
    setTimeout(() => testPerformanceEventScheduling(), 1000);
    setTimeout(() => testCueSystem(), 1500);
    setTimeout(() => testComplexTimeSignatures(), 2000);
    setTimeout(() => testTempoChanges(), 2500);
    setTimeout(() => testComplexMusicalTimes(), 3000);
    setTimeout(() => testMetronome(), 3500);
    setTimeout(() => setupMusicalTimeManagerHelpers(), 4000);

    console.log('✅ All tests queued. Check console output over the next few seconds.');
    console.log('💡 Try testFullPerformance() for a comprehensive demo');
    console.log('💡 Try testMetronome() to test the audio metronome');
}

/**
 * テンポ変化のテスト
 */
export function testTempoChanges() {
    console.log('🎵 Testing tempo changes...');

    const manager = getMusicalTimeManager();
    if (!manager) return;

    // 追加: 自動メトロノーム & 自動開始
    ensureMetronomeForTest('testTempoChanges');

    console.log('--- Tempo Change Tests ---');

    // 初期テンポ
    console.log('Initial tempo:', manager.getCurrentTempo());

    // テンポ変更
    manager.setTempo({
        bpm: 140,
        numerator: 3,
        denominator: 4
    });

    // 音楽的時間を異なるテンポで計算
    const time1: MusicalTime = { type: 'musical', bars: 2, beats: 1 };
    const time2: MusicalTime = {
        type: 'musical_with_tempo',
        bars: 2,
        beats: 1,
        tempo: { bpm: 90, numerator: 4, denominator: 4 }
    };
    const time3: MusicalTime = {
        type: 'tempo_relative',
        beats: 8,
        tempo: { bpm: 160, numerator: 2, denominator: 4 }
    };

    console.log('Current tempo calculation (140 BPM, 3/4):', manager.musicalTimeToAbsolute(time1), 'seconds');
    console.log('Explicit tempo calculation (90 BPM, 4/4):', manager.musicalTimeToAbsolute(time2), 'seconds');
    console.log('Tempo relative calculation (160 BPM, 2/4):', manager.musicalTimeToAbsolute(time3), 'seconds');

    // テンポ履歴のテスト
    manager.setTempo({ bpm: 180, numerator: 4, denominator: 4 });
    const currentTime = manager.getCurrentAbsoluteTime();
    const tempoAtCurrentTime = manager.getTempoAtTime(currentTime);
    console.log('Tempo at current time:', tempoAtCurrentTime);

    console.log('✅ Tempo change tests completed');
}

/**
 * 複雑な音楽的時間のテスト
 */
export function testComplexMusicalTimes() {
    console.log('🎼 Testing complex musical times...');

    const manager = getMusicalTimeManager();
    if (!manager) return;

    // 追加: 自動メトロノーム & 自動開始
    ensureMetronomeForTest('testComplexMusicalTimes');

    console.log('--- Complex Musical Time Tests ---');

    // 複雑拍子での計算
    const complexTempo = { bpm: 72, numerator: 7, denominator: 8, subdivision: 16 };

    const time1: MusicalTime = {
        type: 'musical_with_tempo',
        bars: 3,
        beats: 5,
        subdivisions: 3,
        tempo: complexTempo
    };

    const time2: MusicalTime = {
        type: 'musical',
        bars: 1,
        beats: 1,
        subdivisions: 0,
        tempo: { bpm: 200, numerator: 2, denominator: 2 }
    };

    console.log('Complex time (7/8, 72 BPM, 3小節5拍目+3/16):', manager.musicalTimeToAbsolute(time1), 'seconds');
    console.log('Simple time with tempo (2/2, 200 BPM, 1小節1拍目):', manager.musicalTimeToAbsolute(time2), 'seconds');

    // テンポ変更を考慮した計算のテスト
    manager.setTempo({ bpm: 60, numerator: 4, denominator: 4 });

    const timeWithHistory: MusicalTime = { type: 'musical', bars: 4, beats: 1 };
    const resultWithHistory = manager.musicalTimeToAbsoluteWithTempoChanges(timeWithHistory);
    const resultNormal = manager.musicalTimeToAbsolute(timeWithHistory);

    console.log('With tempo history:', resultWithHistory, 'seconds');
    console.log('Normal calculation:', resultNormal, 'seconds');

    console.log('✅ Complex musical time tests completed');
}

/**
 * メトロノーム機能のテスト
 */
export function testMetronome() {
    console.log('🥁 Testing metronome functionality...');

    const manager = getMusicalTimeManager();
    if (!manager) {
        console.error('❌ MusicalTimeManager not initialized. Please run "🎼 Musical Time Tests" first');
        return;
    }

    console.log('--- Metronome Tests ---');

    // メトロノーム有効化
    manager.enableMetronome();

    // 音量設定テスト
    manager.setMetronomeVolume(0.5);

    // テストパターン再生
    console.log('🔊 Playing metronome test pattern...');
    manager.playMetronomeTest();

    // 実際の音楽的時間でのテスト
    setTimeout(() => {
        console.log('🎼 Starting 4/4 pattern with metronome...');
        manager.start();

        // 8秒後に停止
        setTimeout(() => {
            manager.stop();
            console.log('⏹️ Stopped musical time');

            // テンポ変更テスト
            setTimeout(() => {
                console.log('🎵 Testing tempo change with metronome...');
                manager.setTempo({ bpm: 90, numerator: 3, denominator: 4 });
                manager.start();

                // さらに6秒後に停止
                setTimeout(() => {
                    manager.stop();
                    manager.disableMetronome();
                    console.log('✅ Metronome tests completed');
                }, 6000);
            }, 1000);
        }, 8000);
    }, 3000);
}

// 計測機能テストユーティリティ
function logBeatTimingSummary(label: string) {
    const mtm = getMusicalTimeManager();
    if (!mtm) {
        console.warn('MusicalTimeManager 未初期化');
        return;
    }
    const stats = (mtm as any).getBeatTimingStats?.();
    if (!stats) {
        console.log(`[BeatTiming][${label}] サンプルなし`);
        return;
    }
    console.log(`[BeatTiming][${label}] count=${stats.count} mean=${stats.meanDriftMs.toFixed(2)}ms max=${stats.maxDriftMs.toFixed(2)}ms min=${stats.minDriftMs.toFixed(2)}ms std=${stats.stdDevMs.toFixed(2)}ms`);
}

export function testMetronomeWithMeasurement() {
    const mtm = getMusicalTimeManager();
    if (!mtm) {
        console.warn('⚠️ MusicalTimeManager 未初期化 - Base Audio を先に有効化してください');
        return;
    }

    console.log('⏱️ === Metronome Timing Measurement Test ===');
    console.log('📊 Starting 8-bar measurement at current tempo...');

    ensureMetronomeForTest('measurement');
    (mtm as any).enableBeatTimingMeasurement?.(true);

    const tempoObj: any = (mtm as any).currentTempo || { bpm: 120, numerator: 4 };
    const msPerBar = tempoObj.numerator * (60 / tempoObj.bpm) * 1000;
    const testDurationMs = 8 * msPerBar;

    console.log(`🎵 Tempo: ${tempoObj.bpm} BPM, ${tempoObj.numerator}/4`);
    console.log(`⏰ Test duration: ${(testDurationMs / 1000).toFixed(1)} seconds (8 bars)`);
    console.log('🔊 Listening for beat timing variations...');

    setTimeout(() => {
        (mtm as any).disableBeatTimingMeasurement?.();
        logBeatTimingSummary('MetronomeMeasurement');

        // より詳細な分析
        const stats = (mtm as any).getBeatTimingStats?.();
        if (stats && stats.samples.length > 0) {
            console.log('📈 詳細分析:');
            console.log(`   サンプル数: ${stats.count}`);
            console.log(`   平均遅延: ${stats.meanDriftMs.toFixed(2)}ms`);
            console.log(`   最大遅延: ${stats.maxDriftMs.toFixed(2)}ms`);
            console.log(`   最小遅延: ${stats.minDriftMs.toFixed(2)}ms`);
            console.log(`   標準偏差: ${stats.stdDevMs.toFixed(2)}ms`);

            // 警告レベルの判定
            if (Math.abs(stats.meanDriftMs) > 10) {
                console.warn(`⚠️ 平均遅延が10ms以上です: ${stats.meanDriftMs.toFixed(2)}ms`);
            }
            if (stats.stdDevMs > 5) {
                console.warn(`⚠️ タイミングのばらつきが大きいです: ${stats.stdDevMs.toFixed(2)}ms`);
            }
            if (Math.abs(stats.meanDriftMs) < 3 && stats.stdDevMs < 2) {
                console.log('✅ タイミング精度良好です');
            }

            // 最初と最後の数サンプルを表示
            console.log('📋 サンプル例 (最初の3拍):');
            stats.samples.slice(0, 3).forEach((sample: any, i: number) => {
                console.log(`   ${i + 1}. Bar${sample.bar}:${sample.beat} ${sample.driftMs.toFixed(2)}ms`);
            });
        } else {
            console.warn('⚠️ 測定データがありません - メトロノームが動作していない可能性があります');
        }
    }, testDurationMs + 200);
}

/**
 * シンプルな4/4拍子120BPMでの純粋なタイミング測定
 */
export function testSimpleBeatTiming() {
    const mtm = getMusicalTimeManager();
    if (!mtm) {
        console.warn('⚠️ MusicalTimeManager 未初期化 - Base Audio を先に有効化してください');
        return;
    }

    console.log('⏱️ === Simple Beat Timing Test (No Tempo Changes) ===');
    console.log('🎯 Testing pure timing accuracy with minimal interference');

    // 他のテストの影響を避けるため、明示的にクリーンな状態にセット
    mtm.stop?.();
    setupCleanTestEnvironment(mtm);

    // シンプルな4/4拍子、120BPMに固定
    mtm.setTempo?.({
        bpm: 120,
        numerator: 4,
        denominator: 4
    });

    // メトロノーム有効化（音量は少し控えめ）
    mtm.enableMetronome?.();
    mtm.setMetronomeVolume?.(0.3);

    // 計測開始
    (mtm as any).enableBeatTimingMeasurement?.(true);

    console.log('🎵 Fixed tempo: 120 BPM, 4/4');
    console.log('⏰ Test duration: 16.0 seconds (8 bars)');
    console.log('📊 Measuring pure beat timing without events or tempo changes...');
    console.log('🔇 (Minimal logging during measurement for accuracy)');

    // テスト実行
    mtm.start?.();

    // 16秒後（8小節）に測定終了
    setTimeout(() => {
        mtm.stop?.();
        (mtm as any).disableBeatTimingMeasurement?.();

        console.log('🏁 === Simple Beat Timing Test Results ===');

        // 結果取得と詳細分析
        const stats = (mtm as any).getBeatTimingStats?.();
        if (stats && stats.samples.length > 0) {
            console.log(`📊 測定完了: ${stats.count} サンプル`);
            console.log(`⏱️ 平均遅延: ${stats.meanDriftMs.toFixed(3)}ms`);
            console.log(`📈 標準偏差: ${stats.stdDevMs.toFixed(3)}ms`);
            console.log(`⬆️ 最大遅延: ${stats.maxDriftMs.toFixed(3)}ms`);
            console.log(`⬇️ 最小遅延: ${stats.minDriftMs.toFixed(3)}ms`);

            // 精度判定
            if (Math.abs(stats.meanDriftMs) < 2 && stats.stdDevMs < 1.5) {
                console.log('🌟 優秀: タイミング精度が非常に良好です');
            } else if (Math.abs(stats.meanDriftMs) < 5 && stats.stdDevMs < 3) {
                console.log('✅ 良好: タイミング精度は許容範囲内です');
            } else if (Math.abs(stats.meanDriftMs) < 10 && stats.stdDevMs < 5) {
                console.log('⚠️ 注意: タイミングにやや問題があります');
            } else {
                console.log('❌ 問題: タイミング精度に大きな問題があります');
            }

            // サンプル分布
            const early = stats.samples.filter((s: any) => s.driftMs < -1).length;
            const onTime = stats.samples.filter((s: any) => Math.abs(s.driftMs) <= 1).length;
            const late = stats.samples.filter((s: any) => s.driftMs > 1).length;

            console.log('📈 分布:');
            console.log(`   早い(<-1ms): ${early} (${(early / stats.count * 100).toFixed(1)}%)`);
            console.log(`   正確(±1ms): ${onTime} (${(onTime / stats.count * 100).toFixed(1)}%)`);
            console.log(`   遅い(>+1ms): ${late} (${(late / stats.count * 100).toFixed(1)}%)`);

            // 最初と最後のサンプル比較
            if (stats.samples.length >= 6) {
                console.log('🔍 サンプル比較:');
                console.log('   最初の3拍:');
                stats.samples.slice(0, 3).forEach((sample: any, i: number) => {
                    console.log(`     ${i + 1}. Bar${sample.bar}:${sample.beat} ${sample.driftMs.toFixed(3)}ms`);
                });
                console.log('   最後の3拍:');
                stats.samples.slice(-3).forEach((sample: any, i: number) => {
                    const index = stats.samples.length - 3 + i + 1;
                    console.log(`     ${index}. Bar${sample.bar}:${sample.beat} ${sample.driftMs.toFixed(3)}ms`);
                });
            }

        } else {
            console.warn('⚠️ 測定データがありません');
        }

        console.log('✅ Simple beat timing test completed');

    }, 16000); // 16秒 = 8小節 × 4拍 × (60/120) 秒/拍
}
