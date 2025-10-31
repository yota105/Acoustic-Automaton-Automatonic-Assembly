/**
 * Simple Message Sender - スマホへのテストメッセージ送信
 *
 * コントローラーからPlayer画面（スマホ）にメッセージを送信するシンプルなシステム
 * BroadcastChannelとWebSocketのハイブリッドメッセンジャーを利用
 */

import { getControllerMessenger } from './messaging/controllerMessenger';
import type { PerformanceMessage, MessengerStatus } from './messaging/performanceMessenger';

const messenger = getControllerMessenger();

console.log('✅ [SimpleMessageSender] Messenger initialised');
console.log('📍 [SimpleMessageSender] Current origin:', window.location.origin);

messenger.onMessage((message) => {
    console.log('📨 [SimpleMessageSender] Message observed:', message);
});

let diagnosticSubscription: (() => void) | null = null;
let statusSubscription: (() => void) | null = null;

/**
 * メッセージタイプの定義
 */
export type MessageType =
    | 'test-alert'       // テスト用アラート
    | 'test-notification' // テスト用通知
    | 'test-cue'         // テスト用キュー
    | 'countdown'        // カウントダウン
    | 'rehearsal-mark'   // 練習番号
    | 'metronome-pulse'  // メトロノームパルス
    | 'current-section'  // 現在のセクション
    | 'next-section'     // 次のセクション
    | 'diagnostic-ping'  // 接続診断: ping
    | 'diagnostic-pong'  // 接続診断: pong
    | 'custom';          // カスタムメッセージ

/**
 * メッセージペイロード
 */
export type MessagePayload = PerformanceMessage;

/**
 * 全Playerにメッセージを送信
 */
export function sendToAllPlayers(type: MessageType, data?: any) {
    const message = messenger.send({
        type,
        target: 'all',
        data,
    });
    console.log('📡 [Broadcast to ALL]', message);
    return message;
}

/**
 * 特定のPlayerにメッセージを送信
 */
export function sendToPlayer(playerId: string, type: MessageType, data?: any) {
    const message = messenger.send({
        type,
        target: playerId,
        data,
    });
    console.log(`📡 [Sent to Player ${playerId}]`, message);
    return message;
}

/**
 * 複数の特定Playerにメッセージを送信
 */
export function sendToPlayers(playerIds: string[], type: MessageType, data?: any) {
    playerIds.forEach(playerId => {
        sendToPlayer(playerId, type, data);
    });
}

/**
 * テストアラートを送信
 */
export function sendTestAlert(message: string, target: 'all' | string = 'all') {
    if (target === 'all') {
        return sendToAllPlayers('test-alert', { message });
    } else {
        return sendToPlayer(target, 'test-alert', { message });
    }
}

/**
 * テスト通知を送信
 */
export function sendTestNotification(message: string, duration: number = 3000, target: 'all' | string = 'all') {
    const data = { message, duration };
    if (target === 'all') {
        return sendToAllPlayers('test-notification', data);
    } else {
        return sendToPlayer(target, 'test-notification', data);
    }
}

/**
 * テストキューを送信
 */
export function sendTestCue(message: string, color: string = '#FFA500', target: 'all' | string = 'all') {
    const data = { message, color };
    if (target === 'all') {
        return sendToAllPlayers('test-cue', data);
    } else {
        return sendToPlayer(target, 'test-cue', data);
    }
}

/**
 * カウントダウンを送信
 */
export function sendCountdown(bars: number, beats: number = 0, target: 'all' | string = 'all') {
    const data = { bars, beats };
    if (target === 'all') {
        return sendToAllPlayers('countdown', data);
    } else {
        return sendToPlayer(target, 'countdown', data);
    }
}

/**
 * カスタムメッセージを送信
 */
export function sendCustomMessage(data: any, target: 'all' | string = 'all') {
    if (target === 'all') {
        return sendToAllPlayers('custom', data);
    } else {
        return sendToPlayer(target, 'custom', data);
    }
}

/**
 * 1秒カウントダウン後にパルスを送信
 */
export function sendOneSecondCountdownAndPulse(target: 'all' | string) {
    const resolvedTarget = target ?? 'all';

    const durationMs = 1000;
    const start = performance.now();

    const update = () => {
        const elapsed = performance.now() - start;
        const remaining = Math.max(0, durationMs - elapsed);
        const seconds = remaining / 1000;
        const progress = remaining / durationMs;

        messenger.send({
            type: 'countdown-smooth',
            target: resolvedTarget,
            data: {
                seconds,
                displaySeconds: Math.max(seconds, 0),
                progress
            }
        });

        if (remaining > 0) {
            requestAnimationFrame(update);
        } else {
            messenger.send({
                type: 'metronome-pulse',
                target: resolvedTarget,
                data: {}
            });
        }
    };

    update();
}

/**
 * 簡易テストUI作成
 */
export function createSimpleTestUI(containerId: string = 'simple-test-container') {
    let container = document.getElementById(containerId);

    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #4CAF50;
            border-radius: 8px;
            padding: 16px;
            z-index: 10000;
            max-width: 320px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        document.body.appendChild(container);
    }

    container.innerHTML = `
        <style>
            .test-ui-title {
                color: #4CAF50;
                font-weight: bold;
                margin-bottom: 12px;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .test-ui-section {
                margin-bottom: 12px;
            }
            .test-ui-label {
                color: #fff;
                font-size: 12px;
                margin-bottom: 4px;
                display: block;
            }
            .test-ui-select, .test-ui-input {
                width: 100%;
                padding: 6px;
                margin-bottom: 8px;
                border: 1px solid #555;
                border-radius: 4px;
                background: #222;
                color: #fff;
                font-size: 12px;
            }
            .test-ui-btn {
                width: 100%;
                padding: 8px;
                margin-bottom: 6px;
                border: none;
                border-radius: 4px;
                background: #4CAF50;
                color: #fff;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 12px;
            }
            .test-ui-btn:hover {
                background: #45a049;
                transform: translateY(-1px);
            }
            .test-ui-btn:active {
                transform: translateY(0);
            }
            .test-ui-btn.secondary {
                background: #2196F3;
            }
            .test-ui-btn.secondary:hover {
                background: #1976D2;
            }
            .test-ui-btn.warning {
                background: #FF9800;
            }
            .test-ui-btn.warning:hover {
                background: #F57C00;
            }
            .test-ui-close {
                position: absolute;
                top: 8px;
                right: 8px;
                background: transparent;
                border: none;
                color: #fff;
                font-size: 20px;
                cursor: pointer;
                width: 24px;
                height: 24px;
                padding: 0;
                line-height: 1;
            }
            .test-ui-close:hover {
                color: #f44336;
            }
            .test-ui-status {
                margin-top: 8px;
                font-size: 11px;
                color: rgba(255,255,255,0.7);
                line-height: 1.4;
                padding: 8px;
                border-radius: 6px;
                background: rgba(255,255,255,0.06);
            }
            .test-ui-status div + div {
                margin-top: 4px;
            }
            .test-ui-status .warn {
                color: #ffcf66;
            }
            .test-ui-status .error {
                color: #ff9090;
            }
            .test-ui-status .ok {
                color: #8ae6a2;
            }
        </style>
        
        <button class="test-ui-close" onclick="this.parentElement.remove()">×</button>
        <div class="test-ui-title">📱 スマホ送信テスト</div>

        <div class="test-ui-status" id="test-ui-status"></div>
        
        <div class="test-ui-section">
            <label class="test-ui-label">送信先:</label>
            <select class="test-ui-select" id="test-target-select">
                <option value="all">全員 (All Players)</option>
                <option value="1">Player 1</option>
                <option value="2">Player 2</option>
                <option value="3">Player 3</option>
            </select>
        </div>
        
        <div class="test-ui-section">
            <label class="test-ui-label">メッセージ:</label>
            <input type="text" class="test-ui-input" id="test-message-input" 
                   placeholder="テストメッセージを入力..." value="テスト送信成功！">
        </div>
        
        <button class="test-ui-btn" id="test-alert-btn">
            🔔 アラート送信
        </button>
        
        <button class="test-ui-btn secondary" id="test-notification-btn">
            💬 通知送信 (3秒)
        </button>
        
        <button class="test-ui-btn warning" id="test-cue-btn">
            🎯 キュー送信
        </button>
        
        <button class="test-ui-btn" id="test-countdown-btn">
            ⏱️ カウントダウン (4小節)
        </button>
        
        <button class="test-ui-btn secondary" id="test-custom-btn">
            ⚡ カスタムメッセージ
        </button>

        <div class="test-ui-section" style="margin-top: 10px;">
            <label class="test-ui-label">1秒カウントダウン + パルス:</label>
            <button class="test-ui-btn" id="player1-countdown-pulse-btn">🎺 Player 1</button>
            <button class="test-ui-btn" id="player2-countdown-pulse-btn">🎷 Player 2</button>
            <button class="test-ui-btn" id="player3-countdown-pulse-btn">🥁 Player 3</button>
        </div>
    `;

    // イベントリスナー設定
    const targetSelect = document.getElementById('test-target-select') as HTMLSelectElement;
    const messageInput = document.getElementById('test-message-input') as HTMLInputElement;

    const getTarget = () => targetSelect?.value || 'all';
    const getMessage = () => messageInput?.value || 'テストメッセージ';

    document.getElementById('test-alert-btn')?.addEventListener('click', () => {
        sendTestAlert(getMessage(), getTarget());
        console.log('✅ アラート送信完了');
    });

    document.getElementById('test-notification-btn')?.addEventListener('click', () => {
        sendTestNotification(getMessage(), 3000, getTarget());
        console.log('✅ 通知送信完了');
    });

    document.getElementById('test-cue-btn')?.addEventListener('click', () => {
        sendTestCue(getMessage(), '#FF9800', getTarget());
        console.log('✅ キュー送信完了');
    });

    document.getElementById('test-countdown-btn')?.addEventListener('click', () => {
        sendCountdown(4, 0, getTarget());
        console.log('✅ カウントダウン送信完了');
    });

    document.getElementById('test-custom-btn')?.addEventListener('click', () => {
        sendCustomMessage({
            custom: true,
            message: getMessage(),
            timestamp: Date.now()
        }, getTarget());
        console.log('✅ カスタムメッセージ送信完了');
    });

    document.getElementById('player1-countdown-pulse-btn')?.addEventListener('click', () => {
        sendOneSecondCountdownAndPulse('1');
        console.log('✅ Player 1 countdown + pulse 送信完了');
    });

    document.getElementById('player2-countdown-pulse-btn')?.addEventListener('click', () => {
        sendOneSecondCountdownAndPulse('2');
        console.log('✅ Player 2 countdown + pulse 送信完了');
    });

    document.getElementById('player3-countdown-pulse-btn')?.addEventListener('click', () => {
        sendOneSecondCountdownAndPulse('3');
        console.log('✅ Player 3 countdown + pulse 送信完了');
    });

    // ステータス表示
    const statusEl = document.getElementById('test-ui-status');
    const statusMap = new Map<string, { message: string; cls: string }>();

    const renderStatus = () => {
        if (!statusEl) return;
        statusEl.innerHTML = Array.from(statusMap.values())
            .map(entry => `<div class="${entry.cls}">${entry.message}</div>`)
            .join('');
    };

    const setStatus = (key: string, message: string, cls: 'ok' | 'warn' | 'error' | 'info' = 'info') => {
        statusMap.set(key, { message, cls });
        renderStatus();
    };

    // 環境情報
    const hostInfo = window.location.host;
    setStatus('origin', `🔗 現在の接続先: ${hostInfo}`, 'info');

    if (window.location.hostname === 'localhost') {
        setStatus('origin-warning', '⚠️ スマホと通信するには、PC側も「http://<IPアドレス>:1420」で開いてください。', 'warn');
    } else {
        setStatus('origin-warning', '✅ PC とスマホを同じ URL でアクセスしていることを確認してください。', 'ok');
    }

    // トランスポートの状態更新
    statusSubscription?.();
    statusSubscription = messenger.onStatusChange((status: MessengerStatus) => {
        switch (status.broadcast) {
            case 'connected':
                setStatus('transport-broadcast', '✅ BroadcastChannel: 利用可能', 'ok');
                break;
            case 'error':
                setStatus('transport-broadcast', '❌ BroadcastChannel: エラー', 'error');
                break;
            case 'unavailable':
                setStatus('transport-broadcast', '⚠️ BroadcastChannel: 未対応ブラウザ', 'warn');
                break;
            default:
                setStatus('transport-broadcast', `ℹ️ BroadcastChannel: ${status.broadcast}`, 'info');
                break;
        }

        switch (status.websocket) {
            case 'connected':
                setStatus('transport-websocket', '✅ WebSocket: 接続済み', 'ok');
                break;
            case 'connecting':
                setStatus('transport-websocket', '⏳ WebSocket: 接続中...', 'warn');
                break;
            case 'error':
                setStatus('transport-websocket', `❌ WebSocket: エラー (${status.lastError ?? '不明'})`, 'error');
                break;
            case 'disabled':
                setStatus('transport-websocket', 'ℹ️ WebSocket: 無効', 'info');
                break;
            default:
                setStatus('transport-websocket', `ℹ️ WebSocket: ${status.websocket}`, 'info');
                break;
        }
    });

    // 接続診断 (Ping → Pong)
    const diagnosticId = `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let diagnosticResolved = false;

    setStatus('diagnostic', '⏳ Player からの応答を待っています...', 'warn');

    diagnosticSubscription?.();
    diagnosticSubscription = messenger.onMessage((message: PerformanceMessage) => {
        if (message.type === 'diagnostic-pong' && message.data?.id === diagnosticId) {
            diagnosticResolved = true;
            const player = message.data?.player || '?';
            const origin = message.data?.origin || '(不明)';
            setStatus('diagnostic', `✅ Player ${player} から応答を受信 (${origin})`, 'ok');
        }
    });

    messenger.send({
        type: 'diagnostic-ping',
        target: 'all',
        data: {
            id: diagnosticId,
            sender: 'controller',
            origin: window.location.origin,
            timestamp: Date.now()
        }
    });

    window.setTimeout(() => {
        if (!diagnosticResolved) {
            setStatus('diagnostic', '⚠️ Player から応答がありません。WebSocket接続またはURL設定を確認してください。', 'error');
        }
    }, 2500);

    console.log('📱 Simple Test UI created!');
    return container;
}

// グローバルに公開（開発者ツールから使用可能）
if (typeof window !== 'undefined') {
    (window as any).playerMessenger = {
        sendToAllPlayers,
        sendToPlayer,
        sendToPlayers,
        sendTestAlert,
        sendTestNotification,
        sendTestCue,
        sendCountdown,
        sendCustomMessage,
        sendOneSecondCountdownAndPulse,
        createSimpleTestUI
    };
}
