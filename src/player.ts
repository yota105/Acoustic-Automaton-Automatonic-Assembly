// Player Screen TypeScript
// URLパラメータから奏者番号を取得して、それぞれに異なる指示を表示

import { ScoreRenderer } from './audio/scoreRenderer';
import { getSection1ScoreForPlayer } from './sequence/sections/section1';
import { createPlayerMessenger } from './messaging/playerMessenger';
import type { PerformanceMessage } from './messaging/performanceMessenger';

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

if (countdownCanvas) {
    countdownGauge = new CircularGauge(countdownCanvas);
}

// ヘッダー要素（パルスアニメーション用）
const headerEl = document.getElementById('header');
let isAnimating = false;

// アニメーション終了イベントでクリーンアップ
if (headerEl) {
    headerEl.addEventListener('animationend', () => {
        headerEl.classList.remove('pulse');
        isAnimating = false;
    });
}

function triggerMetronomePulse() {
    if (!headerEl) return;

    // 既にアニメーション中の場合は無視（2重発火を防止）
    if (isAnimating) {
        console.log('Metronome pulse skipped (already animating)');
        return;
    }

    // アニメーション開始
    isAnimating = true;

    // 既存のクラスを削除してリセット（force reflow）
    headerEl.classList.remove('pulse');
    void headerEl.offsetWidth; // リフローを強制してアニメーションを確実にリスタート

    // パルスクラスを追加
    headerEl.classList.add('pulse');
    console.log('Metronome pulse triggered');
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
function showSmoothCountdown(_seconds: number, displaySeconds: number, progress: number) {
    if (!countdownGauge) return;

    // カウントが0以下になったら非表示にする
    if (displaySeconds <= 0) {
        countdownGauge.clear();
        return;
    }

    let text = '';
    let color = '#FFA500';

    // 表示する秒数（小数点第一位まで）
    text = `${displaySeconds.toFixed(1)}`;

    // 色の連続的な変化（緑 → 黄 → オレンジ → 赤）
    // progressは1.0（開始）から0.0（終了）まで変化
    color = interpolateColor(progress);

    // プログレスは連続的に変化、サイズは常にmedium
    countdownGauge.draw(progress, text, color, 'medium');
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

        case 'countdown':
            // カウントダウン表示
            if (data.bars !== undefined || data.beats !== undefined) {
                showCountdown(data.bars || 0, data.beats || 0);
                console.log(`Countdown: ${data.bars} bars, ${data.beats} beats`);
            }
            break;

        case 'countdown-smooth':
            // 滑らかなカウントダウン表示
            if (data.seconds !== undefined && data.displaySeconds !== undefined && data.progress !== undefined) {
                showSmoothCountdown(data.seconds, data.displaySeconds, data.progress);
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
function showNotification(message: string, duration: number = 3000) {
    // 通知要素を作成
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(33, 150, 243, 0.95);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-size: 18px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideDown 0.3s ease-out;
    `;

    // アニメーション定義
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
        @keyframes slideUp {
            from {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            to {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // 指定時間後にフェードアウトして削除
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

/**
 * キューメッセージを大きく中央に表示
 */
function showCueMessage(message: string, color: string = '#FFA500') {
    // キュー要素を作成
    const cueElement = document.createElement('div');
    cueElement.textContent = message;
    cueElement.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        background: ${color};
        color: white;
        padding: 32px 48px;
        border-radius: 16px;
        font-size: 32px;
        font-weight: bold;
        z-index: 10001;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        text-align: center;
        max-width: 80%;
        animation: cuePopIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
    `;

    // アニメーション定義
    const style = document.createElement('style');
    style.textContent = `
        @keyframes cuePopIn {
            0% {
                transform: translate(-50%, -50%) scale(0);
                opacity: 0;
            }
            50% {
                transform: translate(-50%, -50%) scale(1.1);
            }
            100% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }
        @keyframes cuePopOut {
            0% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
            100% {
                transform: translate(-50%, -50%) scale(0);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(cueElement);

    // 3秒後にフェードアウトして削除
    setTimeout(() => {
        cueElement.style.animation = 'cuePopOut 0.3s ease-out forwards';
        setTimeout(() => {
            cueElement.remove();
        }, 300);
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