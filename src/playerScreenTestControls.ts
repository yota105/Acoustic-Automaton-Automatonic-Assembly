/**
 * Player Screen Test Controls
 * 
 * このファイルは開発・デバッグ用です。
 * 本番環境では削除またはコメントアウトしてください。
 * 
 * 役割: コントローラー画面からメッセンジャー経由で
 * 奏者用画面（player.html）に信号を送り、動作をテストする
 */
import { getControllerMessenger } from './messaging/controllerMessenger';

const messenger = getControllerMessenger();

/**
 * プレイヤー画面テストコントロールの初期化
 */
export function setupPlayerScreenTestControls() {
    // 練習番号のリスト
    const rehearsalMarks = ['Intro', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    let currentMarkIndex = 0;

    // セクション名のリスト
    const sectionNames = ['Section A', 'Section B', 'Section C', 'Interlude', 'Coda'];
    let currentSectionIndex = 0;

    const pulseBtn = document.getElementById('test-pulse');
    const rehearsalBtn = document.getElementById('test-rehearsal');
    const countdownBtn = document.getElementById('test-countdown');
    const currentSectionBtn = document.getElementById('test-current-section');
    const nextSectionBtn = document.getElementById('test-next-section');
    const hideNextBtn = document.getElementById('test-hide-next');
    const countdownSecondsInput = document.getElementById('countdown-seconds') as HTMLInputElement;
    const countdownSecondsBtn = document.getElementById('test-countdown-seconds');

    if (pulseBtn) {
        pulseBtn.addEventListener('click', () => {
            messenger.send({
                type: 'metronome-pulse',
                target: 'all',
                data: {}
            });
            console.log('📡 Sent metronome pulse signal');
        });
    }

    if (rehearsalBtn) {
        rehearsalBtn.addEventListener('click', () => {
            const mark = rehearsalMarks[currentMarkIndex % rehearsalMarks.length];
            currentMarkIndex++;
            messenger.send({
                type: 'rehearsal-mark',
                target: 'all',
                data: { mark }
            });
            console.log(`📡 Sent rehearsal mark: ${mark}`);
        });
    }

    if (countdownBtn) {
        countdownBtn.addEventListener('click', () => {
            messenger.send({
                type: 'countdown',
                target: 'all',
                data: { bars: 4, beats: 0 }
            });
            console.log('📡 Sent countdown signal: 4 bars');
        });
    }

    if (currentSectionBtn) {
        currentSectionBtn.addEventListener('click', () => {
            const name = sectionNames[currentSectionIndex % sectionNames.length];
            messenger.send({
                type: 'current-section',
                target: 'all',
                data: { name }
            });
            console.log(`📡 Sent current section: ${name}`);
        });
    }

    if (nextSectionBtn) {
        nextSectionBtn.addEventListener('click', () => {
            currentSectionIndex++;
            const name = sectionNames[currentSectionIndex % sectionNames.length];
            messenger.send({
                type: 'next-section',
                target: 'all',
                data: { name }
            });
            console.log(`📡 Sent next section: ${name}`);
        });
    }

    if (hideNextBtn) {
        hideNextBtn.addEventListener('click', () => {
            messenger.send({
                type: 'next-section',
                target: 'all',
                data: { name: '' }  // 空文字列で非表示
            });
            console.log('📡 Sent: Hide next section');
        });
    }

    // 秒数指定カウントダウン
    if (countdownSecondsBtn && countdownSecondsInput) {
        countdownSecondsBtn.addEventListener('click', () => {
            const seconds = parseInt(countdownSecondsInput.value) || 5;
            startSecondsCountdown(seconds);
        });
    }

    console.log('🎮 Player screen test controls initialized');
}

/**
 * 秒数指定でカウントダウンを開始（滑らかに変化）
 */
function startSecondsCountdown(totalSeconds: number) {
    const startTime = Date.now();
    const duration = totalSeconds * 1000; // ミリ秒に変換

    console.log(`⏱️ Starting ${totalSeconds} second countdown (smooth)...`);

    let lastDisplayedSecond = totalSeconds;

    const animate = () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const remainingSeconds = remaining / 1000;

        // 表示用の秒数（小数点を含む実数値）
        const displaySeconds = remainingSeconds;

        // 秒が変わったときだけコンソールログ（整数部分で判定）
        const currentSecond = Math.ceil(remainingSeconds);
        if (currentSecond !== lastDisplayedSecond && currentSecond > 0) {
            console.log(`⏱️ ${currentSecond} seconds remaining...`);
            lastDisplayedSecond = currentSecond;
        }

        if (remaining > 0) {
            // プログレスは連続的に変化（0.0〜1.0）
            const progress = remainingSeconds / totalSeconds;

            messenger.send({
                type: 'countdown-smooth',
                target: 'all',
                data: {
                    seconds: remainingSeconds,
                    displaySeconds: displaySeconds,
                    progress: progress
                }
            });

            requestAnimationFrame(animate);
        } else {
            // カウントダウン終了 - カウントダウンをクリア
            messenger.send({
                type: 'countdown-smooth',
                target: 'all',
                data: {
                    seconds: 0,
                    displaySeconds: 0,
                    progress: 0
                }
            });

            // パルスを発火
            messenger.send({
                type: 'metronome-pulse',
                target: 'all',
                data: {}
            });
            console.log('⏱️ Countdown finished! Cleared and pulse triggered.');
        }
    };

    animate();
}

/**
 * プログラムから直接メトロノームパルスを送る
 */
export function sendMetronomePulse() {
    messenger.send({
        type: 'metronome-pulse',
        target: 'all',
        data: {}
    });
}

/**
 * プログラムから練習番号を更新
 */
export function sendRehearsalMark(mark: string) {
    messenger.send({
        type: 'rehearsal-mark',
        target: 'all',
        data: { mark }
    });
}

/**
 * プログラムからカウントダウンを表示
 */
export function sendCountdown(bars: number, beats: number = 0) {
    messenger.send({
        type: 'countdown',
        target: 'all',
        data: { bars, beats }
    });
}

/**
 * プログラムから経過時間を更新
 */
export function sendElapsedTime(seconds: number) {
    messenger.send({
        type: 'elapsed-time',
        target: 'all',
        data: { seconds }
    });
}

/**
 * プログラムから現在のセクション名を更新
 */
export function sendCurrentSection(name: string) {
    messenger.send({
        type: 'current-section',
        target: 'all',
        data: { name }
    });
}

/**
 * プログラムから次のセクション名を更新（空文字列で非表示）
 */
export function sendNextSection(name: string) {
    messenger.send({
        type: 'next-section',
        target: 'all',
        data: { name }
    });
}

// グローバルスコープに関数をエクスポート（コンソールからのテスト用）
if (typeof window !== 'undefined') {
    (window as any).sendMetronomePulse = sendMetronomePulse;
    (window as any).sendRehearsalMark = sendRehearsalMark;
    (window as any).sendCountdown = sendCountdown;
    (window as any).sendElapsedTime = sendElapsedTime;
    (window as any).sendCurrentSection = sendCurrentSection;
    (window as any).sendNextSection = sendNextSection;
}
