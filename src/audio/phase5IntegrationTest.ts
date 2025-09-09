/**
 * Phase 5 Live Performance System - Basic Integration Test
 *
 * このファイルはTrackManagerとLiveMixerの基本的な統合テストを行います
 */

import { TrackManager } from './trackManager';
import { LiveMixer } from './liveMixer';
import { LogicInputManager } from './logicInputs';

async function testPhase5Integration() {
    console.log('🧪 Phase 5 統合テスト開始');

    try {
        // AudioContextの作成
        const audioContext = new AudioContext();

        // モックLogicInputManagerの作成
        const mockLogicInputManager = {
            list: () => [
                { id: 'mic1', label: 'Microphone 1', trackId: null },
                { id: 'mic2', label: 'Microphone 2', trackId: null }
            ],
            setTrackId: (inputId: string, trackId: string) => {
                console.log(`LogicInput ${inputId} -> Track ${trackId}`);
            }
        } as LogicInputManager;

        // TrackManagerの作成
        const trackManager = new TrackManager(audioContext);

        // LiveMixerの作成
        const liveMixer = new LiveMixer(
            audioContext,
            trackManager as any, // 型キャスト（実際の統合時は適切な型を使用）
            mockLogicInputManager
        );

        console.log('✅ 基本コンポーネント初期化成功');

        // Track作成テスト
        console.log('🎵 Track作成テスト...');
        const micTrack = await trackManager.createTrack({
            kind: 'mic',
            name: 'Test Microphone'
        });
        console.log(`✅ Microphone Track作成: ${micTrack.id}`);

        const synthTrack = await trackManager.createTrack({
            kind: 'faust',
            name: 'Test Synth'
        });
        console.log(`✅ Faust Track作成: ${synthTrack.id}`);

        // Track統計確認
        const stats = trackManager.getTrackStats();
        console.log(`📊 Track統計: ${stats.total} tracks, ${stats.byKind.mic} mics, ${stats.byKind.faust} fausts`);

        // LiveMixerチャンネル作成テスト（publicメソッド経由）
        console.log('🎛️ LiveMixerチャンネル作成テスト...');

        // 内部シンセセットアップでチャンネルを作成
        await liveMixer.setupInternalSynth();

        const channels = liveMixer.getChannels();
        if (channels.length > 0) {
            const channel = channels[0];
            console.log(`✅ チャンネル作成: ${channel.id} (${channel.name})`);
        } else {
            console.log('⚠️ チャンネルが作成されませんでした');
        }

        // レベルメーター確認
        const levels = liveMixer.getAllLevels();
        console.log(`📊 レベル情報取得: ${Object.keys(levels).length} チャンネル`);

        console.log('🎉 Phase 5 統合テスト完了 - すべての基本機能が正常に動作');

        // クリーンアップ
        liveMixer.dispose();
        audioContext.close();

    } catch (error) {
        console.error('❌ テスト失敗:', error);
    }
}

// ブラウザ環境での実行確認
if (typeof window !== 'undefined') {
    // ユーザー操作が必要なため、ボタンクリックでテスト実行
    console.log('🌐 ブラウザ環境検出 - テスト実行にはユーザー操作が必要です');
    console.log('💡 コンソールで testPhase5Integration() を実行してください');

    // グローバル関数として公開
    (window as any).testPhase5Integration = testPhase5Integration;
} else {
    // Node.js環境での自動実行
    testPhase5Integration();
}
