export type PerformanceRole = 'controller' | 'player';

export type TransportName = 'broadcast' | 'websocket';

export type TransportState =
    | 'unavailable'
    | 'connecting'
    | 'connected'
    | 'error'
    | 'disabled';

export interface PerformanceMessage {
    id: string;
    type: string;
    target?: 'all' | 'controller' | string;
    data?: any;
    timestamp: number;
    transport?: TransportName;
    source?: PerformanceRole;
}

export interface MessengerStatus {
    broadcast: TransportState;
    websocket: TransportState;
    lastError?: string;
    websocketReconnectAttempts: number;
}

type MessageHandler = (message: PerformanceMessage) => void;
type StatusHandler = (status: MessengerStatus) => void;

interface MessengerOptions {
    playerNumber?: string;
    websocketPort?: number;
    websocketPath?: string;
}

const metaEnv = typeof import.meta !== 'undefined' && (import.meta as any)?.env ? (import.meta as any).env : {};
const DEFAULT_WS_PORT = Number(metaEnv.VITE_PERFORMANCE_WS_PORT ?? 1421);
const DEFAULT_WS_PATH = metaEnv.VITE_PERFORMANCE_WS_PATH ?? '/performance';

const createRandomId = () => {
    try {
        return crypto.randomUUID();
    } catch {
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
};

interface SendInput {
    type: string;
    target?: 'all' | 'controller' | string;
    data?: any;
    id?: string;
    timestamp?: number;
}

export class PerformanceMessenger {
    private readonly role: PerformanceRole;
    private readonly playerNumber?: string;
    private readonly messageHandlers = new Set<MessageHandler>();
    private readonly statusHandlers = new Set<StatusHandler>();
    private readonly receivedIds = new Set<string>();
    private readonly queuedMessages: PerformanceMessage[] = [];

    private broadcastChannel?: BroadcastChannel;
    private websocket?: WebSocket;
    private websocketReconnectTimer?: number;
    private websocketAttempts = 0;

    private readonly status: MessengerStatus = {
        broadcast: 'unavailable',
        websocket: 'disabled',
        websocketReconnectAttempts: 0,
    };

    private readonly websocketPort: number;
    private readonly websocketPath: string;

    constructor(role: PerformanceRole, options: MessengerOptions = {}) {
        this.role = role;
        this.playerNumber = options.playerNumber;
        this.websocketPort = options.websocketPort ?? DEFAULT_WS_PORT;
        this.websocketPath = options.websocketPath ?? DEFAULT_WS_PATH;

        this.setupBroadcastChannel();
        this.setupWebSocket();
    }

    /**
     * メッセージ送信
     */
    send(partial: SendInput) {
        const message: PerformanceMessage = {
            id: partial.id ?? createRandomId(),
            timestamp: partial.timestamp ?? Date.now(),
            source: this.role,
            ...partial,
        };

        // BroadcastChannel送信
        if (this.broadcastChannel && this.status.broadcast !== 'unavailable') {
            const broadcastPayload: PerformanceMessage = { ...message, transport: 'broadcast' };
            try {
                this.broadcastChannel.postMessage(broadcastPayload);
            } catch (error) {
                console.error('[PerformanceMessenger] BroadcastChannel send failed', error);
                this.updateStatus({ broadcast: 'error', lastError: `${error}` });
            }
        }

        // WebSocket送信
        if (this.websocket) {
            const socketReady = this.websocket.readyState === WebSocket.OPEN;
            if (socketReady) {
                this.sendViaWebSocket({ ...message, transport: 'websocket' });
            } else {
                this.queueMessage({ ...message, transport: 'websocket' });
            }
        }

        return message;
    }

    /**
     * メッセージ受信ハンドラー登録
     */
    onMessage(handler: MessageHandler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    /**
     * ステータス変更ハンドラー登録
     */
    onStatusChange(handler: StatusHandler) {
        this.statusHandlers.add(handler);
        handler(this.status);
        return () => this.statusHandlers.delete(handler);
    }

    /**
     * 現在のステータス取得
     */
    getStatus(): MessengerStatus {
        return { ...this.status };
    }

    /**
     * 資源解放
     */
    dispose() {
        this.messageHandlers.clear();
        this.statusHandlers.clear();

        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = undefined;
        }

        if (this.websocket) {
            this.websocket.close();
            this.websocket = undefined;
        }

        if (this.websocketReconnectTimer) {
            clearTimeout(this.websocketReconnectTimer);
            this.websocketReconnectTimer = undefined;
        }
    }

    /**
     * BroadcastChannel初期化
     */
    private setupBroadcastChannel() {
        if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
            this.updateStatus({ broadcast: 'unavailable' });
            return;
        }

        try {
            this.broadcastChannel = new BroadcastChannel('performance-control');
            this.broadcastChannel.addEventListener('message', (event) => {
                this.handleIncomingMessage(event.data, 'broadcast');
            });
            this.updateStatus({ broadcast: 'connected' });
        } catch (error) {
            console.error('[PerformanceMessenger] BroadcastChannel init failed', error);
            this.updateStatus({ broadcast: 'error', lastError: `${error}` });
        }
    }

    /**
     * WebSocket初期化
     */
    private setupWebSocket() {
        if (typeof window === 'undefined') {
            this.updateStatus({ websocket: 'disabled' });
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;

        const port = this.websocketPort ?? window.location.port;
        const url = `${protocol}//${host}:${port}${this.websocketPath}?role=${this.role}${this.playerNumber ? `&player=${this.playerNumber}` : ''}`;

        try {
            this.websocket = new WebSocket(url);
        } catch (error) {
            console.error('[PerformanceMessenger] WebSocket init failed', error);
            this.updateStatus({ websocket: 'error', lastError: `${error}` });
            return;
        }

        this.updateStatus({ websocket: 'connecting' });

        this.websocket.addEventListener('open', () => {
            this.websocketAttempts = 0;
            this.updateStatus({ websocket: 'connected', websocketReconnectAttempts: this.websocketAttempts });
            this.flushQueue();
        });

        this.websocket.addEventListener('message', (event) => {
            try {
                const parsed = JSON.parse(event.data);
                this.handleIncomingMessage(parsed, 'websocket');
            } catch (error) {
                console.error('[PerformanceMessenger] Failed to parse WebSocket message', error);
            }
        });

        this.websocket.addEventListener('close', () => {
            this.updateStatus({ websocket: 'connecting' });
            this.scheduleReconnect();
        });

        this.websocket.addEventListener('error', (event) => {
            console.error('[PerformanceMessenger] WebSocket error', event);
            this.updateStatus({ websocket: 'error', lastError: 'WebSocket error' });
        });
    }

    /**
     * メッセージ受信
     */
    private handleIncomingMessage(payload: PerformanceMessage, transport: TransportName) {
        if (!payload || typeof payload !== 'object') return;

        const messageId = payload.id ?? createRandomId();
        if (this.receivedIds.has(messageId)) {
            return;
        }

        this.receivedIds.add(messageId);

        const message: PerformanceMessage = {
            transport,
            ...payload,
            id: messageId,
        };

        this.messageHandlers.forEach((handler) => {
            try {
                handler(message);
            } catch (error) {
                console.error('[PerformanceMessenger] message handler error', error);
            }
        });
    }

    private sendViaWebSocket(message: PerformanceMessage) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            this.queueMessage(message);
            return;
        }

        try {
            this.websocket.send(JSON.stringify(message));
        } catch (error) {
            console.error('[PerformanceMessenger] WebSocket send failed', error);
            this.queueMessage(message);
            this.websocket?.close();
        }
    }

    private queueMessage(message: PerformanceMessage) {
        this.queuedMessages.push(message);
        if (this.queuedMessages.length > 200) {
            this.queuedMessages.shift();
        }
    }

    private flushQueue() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
        while (this.queuedMessages.length > 0) {
            const message = this.queuedMessages.shift();
            if (!message) continue;
            this.sendViaWebSocket(message);
        }
    }

    private scheduleReconnect() {
        if (this.websocketReconnectTimer) {
            return;
        }

        this.websocketAttempts += 1;
        this.updateStatus({ websocketReconnectAttempts: this.websocketAttempts });

        const delay = Math.min(5000, 500 * this.websocketAttempts);
        this.websocketReconnectTimer = window.setTimeout(() => {
            this.websocketReconnectTimer = undefined;
            this.setupWebSocket();
        }, delay);
    }

    private updateStatus(partial: Partial<MessengerStatus>) {
        const next: MessengerStatus = {
            ...this.status,
            ...partial,
        };
        this.status.broadcast = next.broadcast;
        this.status.websocket = next.websocket;
        this.status.lastError = next.lastError;
        this.status.websocketReconnectAttempts = next.websocketReconnectAttempts ?? this.status.websocketReconnectAttempts;

        this.statusHandlers.forEach((handler) => {
            try {
                handler(this.getStatus());
            } catch (error) {
                console.error('[PerformanceMessenger] status handler error', error);
            }
        });
    }
}
