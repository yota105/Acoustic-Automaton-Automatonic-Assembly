// Player Screen TypeScript
// URLパラメータから奏者番号を取得して、それぞれに異なる指示を表示

import { ScoreRenderer } from './audio/scoreRenderer';
import { getSection1ScoreForPlayer } from './sequence/sections/section1';
import { createPlayerMessenger } from './messaging/playerMessenger';
import type { PerformanceMessage } from './messaging/performanceMessenger';
import { applyAuthGuard } from './auth/authGuard';

// 認証ガードを最初に適用
applyAuthGuard();

// URLパラメータから奏者番号取得
const params = new URLSearchParams(window.location.search);
const playerNumber = params.get('player') || '1';

// DOM要素の取得
const playerIdEl = document.getElementById('player-id');
const rehearsalMarkEl = document.getElementById('rehearsal-mark');
const elapsedTimeEl = document.getElementById('elapsed-time');
const countdownCanvas = document.getElementById('countdown-canvas') as HTMLCanvasElement;
const currentSectionNameEl = document.getElementById('current-section-name');
const nextSectionNameEl = document.getElementById('next-section-name');
const nextSectionDisplayEl = document.getElementById('next-section-display');
const menuButton = document.getElementById('menu-button');
const menuModal = document.getElementById('menu-modal');
const menuClose = document.getElementById('menu-close');
const menuPlayerName = document.getElementById('menu-player-name');
const currentScoreAreaEl = document.getElementById('current-score-area');
const nextScoreAreaEl = document.getElementById('next-score-area');

const existingNotificationContainer = document.querySelector<HTMLDivElement>('.player-notification-container');
const notificationContainer = existingNotificationContainer ?? (() => {
    const container = document.createElement('div');
    container.className = 'player-notification-container';
    document.body.appendChild(container);
    return container;
})();

// プレイヤー情報を表示
if (playerIdEl) {
    playerIdEl.textContent = `Player ${playerNumber}`;
}

// メニューモーダルにもプレイヤー名を設定
if (menuPlayerName) {
    menuPlayerName.textContent = `Player ${playerNumber}`;
}

// メニューの開閉
if (menuButton && menuModal) {
    menuButton.addEventListener('click', () => {
        menuModal.classList.add('active');
    });
}

if (menuClose && menuModal) {
    menuClose.addEventListener('click', () => {
        menuModal.classList.remove('active');
    });
}

// モーダルの背景をクリックしても閉じる
if (menuModal) {
    menuModal.addEventListener('click', (e) => {
        if (e.target === menuModal) {
            menuModal.classList.remove('active');
        }
    });
}

// 練習用: Performance開始ボタン
const startPerformanceBtn = document.getElementById('start-performance-btn');
const stopPerformanceBtn = document.getElementById('stop-performance-btn');

if (startPerformanceBtn) {
    startPerformanceBtn.addEventListener('click', async () => {
        try {
            // メニューを閉じる
            if (menuModal) {
                menuModal.classList.remove('active');
            }

            // カウントダウン開始（3秒）
            const countdownDuration = 3;
            for (let i = countdownDuration; i > 0; i--) {
                showSecondsCountdown(i, `練習開始まで`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // カウントダウン完了（メッセージなし）
            clearCountdownDisplay();

            // Audio Contextの初期化
            const { ensureBaseAudio } = await import('./audio/audioCore');
            await ensureBaseAudio();

            // CompositionPlayerをインポートして初期化
            const { CompositionPlayer } = await import('./performance/compositionPlayer');
            const { composition } = await import('./works/composition');

            const globalAudio = (window as any);
            const audioContext = globalAudio.audioCtx || globalAudio.audioContext;

            if (!audioContext) {
                throw new Error('Audio Context not available');
            }

            // CompositionPlayerを作成して再生開始
            const player = new CompositionPlayer(audioContext);
            await player.initialize();

            // 経過時間を追跡
            let practiceStartTime = Date.now();
            let elapsedInterval: number | null = null;

            // 経過時間を定期的に更新
            const updatePracticeElapsedTime = () => {
                const elapsedSeconds = Math.floor((Date.now() - practiceStartTime) / 1000);
                updateElapsedTime(elapsedSeconds);
            };

            elapsedInterval = window.setInterval(updatePracticeElapsedTime, 100);

            // playerのイベントを監視
            player.on('state-change', (state: any) => {
                if (!state.isPlaying && elapsedInterval) {
                    clearInterval(elapsedInterval);
                    elapsedInterval = null;
                }
            });

            // セクション変更時の通知
            player.on('section-change', (data: any) => {
                const section = composition.sections.find((s: any) => s.id === data.sectionId);
                if (section) {
                    updateCurrentSectionName(section.name || section.id);
                    console.log('[Player] Section changed:', section.name);
                }
            });

            // 最初のセクション（Section A）を取得して再生
            const firstSection = composition.sections?.[0];
            if (firstSection) {
                // セクション名を表示
                updateCurrentSectionName(firstSection.name || firstSection.id);
                
                // CompositionPlayerで再生開始（イベントが自動実行される）
                await player.play(firstSection.id);
                
                console.log('[Player] Performance started:', firstSection.id);
            } else {
                throw new Error('No sections available');
            }

            // グローバルに保存（停止できるように）
            (window as any).compositionPlayer = player;
            (window as any).practiceElapsedInterval = elapsedInterval;

            // ボタンの表示切り替え
            if (startPerformanceBtn) startPerformanceBtn.style.display = 'none';
            if (stopPerformanceBtn) stopPerformanceBtn.style.display = 'flex';

        } catch (error) {
            console.error('[Player] Failed to start performance:', error);
            showNotification('練習開始に失敗しました', 3000, '#f44336');
        }
    });
}

if (stopPerformanceBtn) {
    stopPerformanceBtn.addEventListener('click', async () => {
        try {
            // メニューを閉じる
            if (menuModal) {
                menuModal.classList.remove('active');
            }

            const player = (window as any).compositionPlayer;
            if (player && typeof player.stop === 'function') {
                await player.stop();
                showNotification('練習を停止しました', 2000);
                console.log('[Player] Performance stopped');
            }

            // 経過時間のインターバルをクリア
            const elapsedInterval = (window as any).practiceElapsedInterval;
            if (elapsedInterval) {
                clearInterval(elapsedInterval);
                (window as any).practiceElapsedInterval = null;
            }

            // 経過時間をリセット
            updateElapsedTime(0);

            // ボタンの表示切り替え
            if (startPerformanceBtn) startPerformanceBtn.style.display = 'flex';
            if (stopPerformanceBtn) stopPerformanceBtn.style.display = 'none';

        } catch (error) {
            console.error('[Player] Failed to stop performance:', error);
            showNotification('停止に失敗しました', 3000, '#f44336');
        }
    });
}

// 円形ゲージの描画クラス
class CircularGauge {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private centerX: number = 0;
    private centerY: number = 0;
    private radius: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas context not available');
        }
        this.ctx = context;
        this.setupCanvas();
        window.addEventListener('resize', () => this.setupCanvas());
    }

    private setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        // スケールをリセットしてからリサイズ
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;
        this.radius = Math.min(rect.width, rect.height) * 0.35;
    }

    draw(progress: number, text: string, color: string = '#FFA500', size: 'small' | 'medium' | 'large' = 'medium') {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        // サイズ調整
        let radiusMultiplier = 1;
        let lineWidth = 16;
        let fontSize = 20;

        switch (size) {
            case 'small':
                radiusMultiplier = 0.7;
                lineWidth = 12;
                fontSize = 16;
                break;
            case 'large':
                radiusMultiplier = 1.3;
                lineWidth = 24;
                fontSize = 28;
                break;
        }

        const maxAvailableRadius = Math.min(this.centerX, this.centerY);
        const desiredRadius = this.radius * radiusMultiplier;
        const drawRadius = Math.max(0, Math.min(desiredRadius, maxAvailableRadius - (lineWidth / 2) - 1));

        // 背景の円は描画しない（プログレスバーのみで表現）

        // 残り部分（まだ経過していない部分）をカラーで描画
        if (progress > 0) {
            this.ctx.beginPath();
            const startAngle = -Math.PI / 2; // 12時の位置から開始
            const endAngle = startAngle + (Math.PI * 2 * progress);
            this.ctx.arc(this.centerX, this.centerY, drawRadius, startAngle, endAngle);
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = lineWidth;
            this.ctx.lineCap = 'butt'; // 境界を垂直にする
            this.ctx.stroke();
        }

        // 経過部分（カラーから灰色になった部分）を灰色で描画
        if (progress < 1) {
            this.ctx.beginPath();
            const startAngle = -Math.PI / 2 + (Math.PI * 2 * progress); // カラー部分の終点から開始
            const endAngle = -Math.PI / 2 + (Math.PI * 2); // 一周
            this.ctx.arc(this.centerX, this.centerY, drawRadius, startAngle, endAngle);
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = lineWidth;
            this.ctx.lineCap = 'butt'; // 境界を垂直にする
            this.ctx.stroke();
        }

        // 文字の背景（黒い円） - サークルと同じサイズ
        const textBackgroundRadius = Math.max(0, drawRadius - lineWidth / 2);
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, textBackgroundRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#000000';
        this.ctx.fill();

        // 中央のテキスト（白色）
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = text.split('\n');
        const lineHeight = fontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        const startY = this.centerY - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line, index) => {
            this.ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
            this.ctx.fillText(line, this.centerX, startY + index * lineHeight);
        });
    }

    clear() {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
    }
}

// ゲージのインスタンス作成
let countdownGauge: CircularGauge | null = null;
let countdownTotalSeconds = 0;
let lastCountdownMessage: string | null = null;
let countdownAnimationRaf: number | null = null;
let countdownEndTime: number | null = null;
const countdownPulseThresholds = [3, 2, 1.5, 1, 0.5];
let countdownPulseTriggered = new Set<number>();
let lastReportedRemainingSeconds: number | null = null;

if (countdownCanvas) {
    countdownGauge = new CircularGauge(countdownCanvas);
}

// ヘッダー要素（パルスアニメーション用）
const headerEl = document.getElementById('header');

type PulseVariant = 'strong' | 'weak';
let pulseState: Record<PulseVariant, boolean> = {
    strong: false,
    weak: false,
};

// アニメーション終了イベントでクリーンアップ
if (headerEl) {
    headerEl.addEventListener('animationend', (event) => {
        if (event.animationName === 'metronomePulseWhite') {
            headerEl.classList.remove('pulse');
            pulseState.strong = false;
        } else if (event.animationName === 'metronomePulseWeak') {
            headerEl.classList.remove('pulse-weak');
            pulseState.weak = false;
        }
    });
}

function triggerHeaderPulse(variant: PulseVariant) {
    if (!headerEl) return;

    const className = variant === 'strong' ? 'pulse' : 'pulse-weak';

    headerEl.classList.remove('pulse');
    headerEl.classList.remove('pulse-weak');
    pulseState.strong = false;
    pulseState.weak = false;
    void headerEl.offsetWidth;

    headerEl.classList.add(className);
    pulseState[variant] = true;
}

function triggerMetronomePulse() {
    triggerHeaderPulse('strong');
    console.log('Metronome pulse triggered');
}

function triggerWeakPulse() {
    triggerHeaderPulse('weak');
    console.log('Metronome weak pulse triggered');
}

// カウントダウンの表示例
function showCountdown(barsRemaining: number, beatsRemaining: number) {
    if (!countdownGauge) return;

    let text = '';
    let progress = 0;
    let color = '#FFA500';

    if (barsRemaining > 0) {
        text = `${barsRemaining}\nbars`;
        progress = Math.min(barsRemaining / 8, 1); // 8小節を最大と仮定
        color = barsRemaining > 2 ? '#FFEB3B' : '#FFA500';
    } else if (beatsRemaining > 1) {
        text = `${beatsRemaining}`;
        progress = beatsRemaining / 4; // 4拍を最大と仮定
        color = beatsRemaining > 2 ? '#FFA500' : '#FF5722';
    } else if (beatsRemaining === 1) {
        text = '1';
        progress = 0.25;
        color = '#FF0000';
    }

    countdownGauge.draw(progress, text, color, 'medium');
}

// 滑らかなカウントダウンの表示
function showSmoothCountdown(_seconds: number, displaySeconds: number, progress: number, label?: string) {
    if (!countdownGauge) return;

    // カウントが0以下になったら非表示にする
    if (displaySeconds <= 0) {
        countdownGauge.clear();
        return;
    }

    let text = '';
    let color = '#FFA500';

    // 表示する秒数（小数点第一位まで）
    text = label ?? `${displaySeconds.toFixed(1)}`;

    // 色の連続的な変化（緑 → 黄 → オレンジ → 赤）
    // progressは1.0（開始）から0.0（終了）まで変化
    color = interpolateColor(progress);

    // プログレスは連続的に変化、サイズは常にmedium
    countdownGauge.draw(progress, text, color, 'medium');
}

function showSecondsCountdown(secondsRemaining: number, message?: string) {
    if (!countdownGauge) {
        return;
    }

    if (secondsRemaining <= 0) {
        triggerMetronomePulse();
        clearCountdownDisplay();
        return;
    }

    const tolerance = 0.05;
    if (lastReportedRemainingSeconds === null || secondsRemaining > lastReportedRemainingSeconds + tolerance) {
        countdownPulseTriggered = new Set<number>();
        countdownTotalSeconds = secondsRemaining;
    } else if (Math.abs(secondsRemaining - 1) <= tolerance) {
        countdownPulseTriggered.delete(1);
    }

    countdownEndTime = performance.now() + secondsRemaining * 1000;
    ensureCountdownAnimationRunning();
    maybeTriggerCountdownPulse(secondsRemaining);

    if (message && message !== lastCountdownMessage) {
        console.log(`🕒 Countdown update: ${message}`);
        lastCountdownMessage = message;
    }

    lastReportedRemainingSeconds = secondsRemaining;
}

function handleSmoothCountdownUpdate(seconds: number, displaySeconds: number, progress: number, label?: string) {
    if (!countdownGauge) {
        return;
    }

    // 外部からのスムーズ更新では自前のアニメーションを止めて、受信値で描画する
    stopCountdownAnimation();

    const remaining = Math.max(0, Number.isFinite(displaySeconds) ? displaySeconds : seconds);
    const normalizedProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const tolerance = 0.05;

    let estimatedTotal = countdownTotalSeconds;
    if (normalizedProgress > 0) {
        const candidate = remaining / normalizedProgress;
        if (Number.isFinite(candidate) && candidate > 0) {
            estimatedTotal = candidate;
        }
    } else if (!estimatedTotal || !Number.isFinite(estimatedTotal)) {
        estimatedTotal = remaining > 0 ? remaining : seconds > 0 ? seconds : 1;
    }

    if (
        lastReportedRemainingSeconds === null ||
        remaining > lastReportedRemainingSeconds + tolerance ||
        countdownTotalSeconds === 0 ||
        !Number.isFinite(countdownTotalSeconds) ||
        Math.abs((countdownTotalSeconds ?? 0) - estimatedTotal) > 0.05 ||
        normalizedProgress >= 0.99
    ) {
        countdownTotalSeconds = estimatedTotal;
        countdownPulseTriggered = new Set<number>();
    }

    if (Math.abs(remaining - 1.5) <= tolerance) {
        countdownPulseTriggered.delete(1.5);
    }
    if (Math.abs(remaining - 1) <= tolerance) {
        countdownPulseTriggered.delete(1);
    }

    if (remaining <= 0.01) {
        triggerMetronomePulse();
        clearCountdownDisplay(undefined);
        return;
    }

    const displayLabel = label ?? (remaining >= 1 ? `${Math.ceil(remaining)}\nsec` : `${remaining.toFixed(1)}`);
    showSmoothCountdown(estimatedTotal, remaining, normalizedProgress, displayLabel);
    maybeTriggerCountdownPulse(remaining);

    lastReportedRemainingSeconds = remaining;
}

function clearCountdownDisplay(message?: string, accentColor: string = '#FFA500') {
    if (countdownGauge) {
        countdownGauge.clear();
    }
    stopCountdownAnimation();
    countdownTotalSeconds = 0;
    lastCountdownMessage = null;
    countdownPulseTriggered = new Set<number>();
    lastReportedRemainingSeconds = null;

    if (message) {
        showNotification(message, 2000, accentColor);
    }
}

// 色の補間関数（緑 → 赤）
function interpolateColor(progress: number): string {
    // progress: 1.0（開始/緑）→ 0.0（終了/赤）

    // RGB値を計算
    let r: number, g: number, b: number;

    if (progress > 0.66) {
        // 緑 → 黄緑（66%〜100%）
        const t = (progress - 0.66) / 0.34;
        r = Math.round(76 + (139 - 76) * (1 - t));    // 76 → 139
        g = Math.round(175 + (195 - 175) * (1 - t));  // 175 → 195
        b = Math.round(80 + (74 - 80) * (1 - t));     // 80 → 74
    } else if (progress > 0.33) {
        // 黄緑 → オレンジ（33%〜66%）
        const t = (progress - 0.33) / 0.33;
        r = Math.round(139 + (255 - 139) * (1 - t));  // 139 → 255
        g = Math.round(195 + (152 - 195) * (1 - t));  // 195 → 152
        b = Math.round(74 + (0 - 74) * (1 - t));      // 74 → 0
    } else {
        // オレンジ → 赤（0%〜33%）
        const t = progress / 0.33;
        r = 255;
        g = Math.round(152 * t);                      // 152 → 0
        b = 0;
    }

    // RGB値を16進数に変換
    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
}

function ensureCountdownAnimationRunning() {
    if (countdownAnimationRaf !== null) {
        return;
    }
    countdownAnimationRaf = requestAnimationFrame(updateCountdownAnimationFrame);
}

function stopCountdownAnimation() {
    if (countdownAnimationRaf !== null) {
        cancelAnimationFrame(countdownAnimationRaf);
        countdownAnimationRaf = null;
    }
    countdownEndTime = null;
}

function updateCountdownAnimationFrame() {
    countdownAnimationRaf = null;

    if (!countdownGauge || countdownEndTime === null) {
        return;
    }

    const now = performance.now();
    const remainingSeconds = Math.max(0, (countdownEndTime - now) / 1000);

    if (remainingSeconds <= 0.01) {
        triggerMetronomePulse();
        clearCountdownDisplay();
        return;
    }

    const total = countdownTotalSeconds || remainingSeconds;
    const clampedProgress = Math.max(0, Math.min(1, total > 0 ? remainingSeconds / total : 0));
    const label = remainingSeconds >= 1 ? `${Math.ceil(remainingSeconds)}\nsec` : `${remainingSeconds.toFixed(1)}`;

    showSmoothCountdown(total, remainingSeconds, clampedProgress, label);
    maybeTriggerCountdownPulse(remainingSeconds);

    countdownAnimationRaf = requestAnimationFrame(updateCountdownAnimationFrame);
}

function maybeTriggerCountdownPulse(remainingSeconds: number) {
    const tolerance = 0.05;
    for (const threshold of countdownPulseThresholds) {
        if (countdownPulseTriggered.has(threshold)) continue;
        if (remainingSeconds <= threshold + tolerance) {
            countdownPulseTriggered.add(threshold);
            triggerWeakPulse();
        }
    }
}

// 時間表示の更新
function updateElapsedTime(seconds: number) {
    if (!elapsedTimeEl) return;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    elapsedTimeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 練習番号の更新
function updateRehearsalMark(mark: string) {
    if (rehearsalMarkEl) {
        rehearsalMarkEl.textContent = `Section: ${mark}`;
    }
}

// 現在のセクション名を更新
function updateCurrentSectionName(sectionName: string) {
    if (currentSectionNameEl) {
        currentSectionNameEl.textContent = sectionName ? `- ${sectionName}` : '';
    }
}

// 次のセクション名を更新（空の場合は非表示）
function updateNextSectionName(sectionName: string) {
    if (nextSectionNameEl) {
        nextSectionNameEl.textContent = sectionName ? `- ${sectionName}` : '';
    }

    // Nextセクション全体の表示/非表示
    if (nextSectionDisplayEl) {
        if (sectionName) {
            nextSectionDisplayEl.classList.remove('hidden');
        } else {
            nextSectionDisplayEl.classList.add('hidden');
        }
    }
}

// 初期化
console.log(`Player ${playerNumber} screen initialized`);

// デモアニメーションは一旦停止（コントローラーからの信号テスト用）
// let demoBar = 1;
// let demoSeconds = 0;

// メッセンジャーでコントローラーから指示を受け取る
const messenger = createPlayerMessenger(playerNumber);

console.log('✅ [Player] Messenger created');
console.log('📍 [Player] Current origin:', window.location.origin);
console.log('🎭 [Player] Player number:', playerNumber);

const handleIncomingMessage = (message: PerformanceMessage) => {
    console.log('📨 [Player] Message received:', message);
    const { type, data, target } = message;
    const payload = data ?? {};

    // ターゲット指定がある場合、自分宛かチェック
    if (target && target !== 'all' && target !== playerNumber) {
        return; // 自分宛ではない
    }

    switch (type) {
        case 'test-alert':
            // テストアラート表示
            if (data?.message) {
                alert(`[Player ${playerNumber}]\n${data.message}`);
                console.log(`🔔 Alert: ${data.message}`);
            }
            break;

        case 'test-notification':
            // テスト通知表示
            if (data?.message) {
                showNotification(data.message, data.duration || 3000);
                console.log(`💬 Notification: ${data.message}`);
            }
            break;

        case 'test-cue':
            // テストキュー表示
            if (data?.message) {
                showCueMessage(data.message, data.color || '#FFA500');
                console.log(`🎯 Cue: ${data.message}`);
            }
            break;

        case 'custom':
            // カスタムメッセージ
            console.log('⚡ Custom message received:', data);
            showNotification(`カスタム: ${data?.message || JSON.stringify(data)}`, 3000);
            break;

        case 'diagnostic-ping':
            // 接続確認への応答
            if (data?.id) {
                messenger.send({
                    type: 'diagnostic-pong',
                    target: 'controller',
                    data: {
                        id: data.id,
                        player: playerNumber,
                        origin: window.location.origin,
                        timestamp: Date.now()
                    }
                });
                console.log('📡 Diagnostic ping received, replying with pong:', data.id);
            }
            break;

        case 'metronome-pulse':
            // メトロノームパルス
            triggerMetronomePulse();
            console.log('Metronome pulse triggered');
            break;

        case 'rehearsal-mark':
            // 練習番号更新
            if (data.mark !== undefined) {
                updateRehearsalMark(data.mark);
                console.log(`Rehearsal mark updated to: ${data.mark}`);
            }
            break;

        case 'countdown': {
            // カウントダウン表示
            const secondsRemaining = typeof payload.secondsRemaining === 'number'
                ? payload.secondsRemaining
                : typeof (message as any).secondsRemaining === 'number'
                    ? (message as any).secondsRemaining
                    : undefined;

            if (secondsRemaining !== undefined) {
                const countdownMessage = payload.message ?? (message as any).message;
                const sectionId = payload.sectionId ?? (message as any).sectionId;
                showSecondsCountdown(secondsRemaining, countdownMessage);
                console.log(`Countdown: ${secondsRemaining}s remaining (section: ${sectionId ?? 'n/a'})`);
            } else if (payload.bars !== undefined || payload.beats !== undefined) {
                showCountdown(payload.bars || 0, payload.beats || 0);
                console.log(`Countdown: ${payload.bars} bars, ${payload.beats} beats`);
            }
            break;
        }

        case 'countdown-cancelled': {
            const cancelMessage = payload.message ?? (message as any).message ?? 'Countdown cancelled';
            clearCountdownDisplay(cancelMessage, '#FF5722');
            console.log('Countdown cancelled by controller');
            break;
        }

        case 'countdown-smooth':
            // 滑らかなカウントダウン表示
            if (payload.seconds !== undefined && payload.displaySeconds !== undefined && payload.progress !== undefined) {
                handleSmoothCountdownUpdate(payload.seconds, payload.displaySeconds, payload.progress, payload.label);
            }
            break;

        case 'elapsed-time':
            // 経過時間更新
            if (data.seconds !== undefined) {
                updateElapsedTime(data.seconds);
            }
            break;

        case 'current-section':
            // 現在のセクション名更新
            if (data.name !== undefined) {
                updateCurrentSectionName(data.name);
                console.log(`Current section updated to: ${data.name}`);
            }
            break;

        case 'next-section':
            // 次のセクション名更新（空文字列で非表示）
            if (data.name !== undefined) {
                updateNextSectionName(data.name);
                console.log(`Next section updated to: ${data.name || '(hidden)'}`);
            }
            break;

        case 'update-score':
            // 楽譜更新
            if (data.scoreData && data.target) {
                updateScore(data.target, data.scoreData, data.player);
                console.log(`Score updated: ${data.target} for player ${data.player || 'all'}`);
            }
            break;
    }
};

messenger.onMessage(handleIncomingMessage);

console.log('Messenger "performance-control" is ready for messages');

/**
 * 楽譜を更新
 */
function updateScore(target: 'current' | 'next', scoreData: any, player?: number) {
    // プレイヤー指定がある場合、自分宛かチェック
    if (player !== undefined) {
        const currentPlayer = parseInt(playerNumber) || 1;
        if (player !== currentPlayer) {
            return; // 自分宛ではない
        }
    }

    // 対象の楽譜エリアにレンダリング
    if (target === 'current' && currentScoreRenderer) {
        currentScoreRenderer.render(scoreData);
        console.log('✅ Current score updated');
    } else if (target === 'next' && nextScoreRenderer) {
        nextScoreRenderer.render(scoreData);
        console.log('✅ Next score updated');
    }
}

/**
 * 通知メッセージを一時的に表示
 */
function showNotification(message: string, duration: number = 3000, accentColor: string = '#f5f5f5') {
    if (!notificationContainer) {
        return;
    }

    while (notificationContainer.childElementCount >= 4) {
        notificationContainer.firstElementChild?.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'player-notification';
    notification.style.setProperty('--accent-color', accentColor);

    const messageEl = document.createElement('div');
    messageEl.className = 'player-notification__message';
    messageEl.textContent = message;
    notification.appendChild(messageEl);

    notificationContainer.appendChild(notification);

    requestAnimationFrame(() => {
        notification.classList.add('is-visible');
    });

    setTimeout(() => {
        notification.classList.remove('is-visible');
        setTimeout(() => {
            notification.remove();
        }, 280);
    }, duration);
}

/**
 * キューメッセージを大きく中央に表示
 */
function showCueMessage(message: string, color: string = '#f5f5f5') {
    const overlay = document.createElement('div');
    overlay.className = 'player-cue-overlay';
    overlay.style.setProperty('--cue-accent', color);

    const cue = document.createElement('div');
    cue.className = 'player-cue';
    cue.textContent = message;
    overlay.appendChild(cue);

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
    });

    setTimeout(() => {
        overlay.classList.remove('is-visible');
        setTimeout(() => {
            overlay.remove();
        }, 320);
    }, 3000);
}

// === 楽譜表示の初期化 ===
let currentScoreRenderer: ScoreRenderer | null = null;
let nextScoreRenderer: ScoreRenderer | null = null;

// ページ読み込み完了後に楽譜を初期化
window.addEventListener('DOMContentLoaded', () => {
    // 現在のセクションの楽譜
    if (currentScoreAreaEl) {
        currentScoreRenderer = new ScoreRenderer(currentScoreAreaEl);

        // セクション1の楽譜を奏者番号に応じて表示
        const playerNum = parseInt(playerNumber) || 1;
        const scoreData = getSection1ScoreForPlayer(playerNum);
        currentScoreRenderer.render(scoreData);

        console.log(`🎵 Loaded score for Player ${playerNum}`);
    }

    // 次のセクションの楽譜
    if (nextScoreAreaEl) {
        nextScoreRenderer = new ScoreRenderer(nextScoreAreaEl);

        // 初期状態では次のセクションは空
        // イベントによって後から表示される
        console.log('📄 Next score area ready');
    }
});

// ウィンドウリサイズ時に楽譜を再描画
window.addEventListener('resize', () => {
    if (currentScoreRenderer && currentScoreAreaEl) {
        currentScoreRenderer.resize();
        currentScoreRenderer.render({
            clef: 'treble',
            timeSignature: '4/4',
            notes: 'B4/q'
        });
    }

    if (nextScoreRenderer && nextScoreAreaEl) {
        nextScoreRenderer.resize();
        nextScoreRenderer.render({
            clef: 'treble',
            timeSignature: '4/4',
            notes: 'B4/q'
        });
    }
});