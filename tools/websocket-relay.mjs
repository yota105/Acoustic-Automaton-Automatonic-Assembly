#!/usr/bin/env node

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PERFORMANCE_WS_PORT ?? 1421);
const PATH = process.env.PERFORMANCE_WS_PATH ?? '/performance';

const server = createServer();
const wss = new WebSocketServer({ server, path: PATH });

const clients = new Map();

const broadcast = (originClient, payload) => {
    const data = JSON.stringify(payload);
    for (const [client, meta] of clients.entries()) {
        if (client.readyState !== 1) continue;
        if (client === originClient) continue;
        try {
            client.send(data);
        } catch (error) {
            console.error('[ws-relay] Failed to forward message to client', meta.id, error);
        }
    }
};

wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? PATH, `http://${request.headers.host}`);
    const role = url.searchParams.get('role') ?? 'unknown';
    const player = url.searchParams.get('player');
    const clientId = randomUUID();

    clients.set(socket, { id: clientId, role, player });

    console.log(`[ws-relay] Client connected: ${clientId} role=${role} player=${player ?? 'n/a'}`);

    socket.on('message', (data) => {
        try {
            const parsed = JSON.parse(data.toString());
            parsed.serverTimestamp = Date.now();
            parsed.serverSource = 'ws-relay';
            broadcast(socket, parsed);
        } catch (error) {
            console.error('[ws-relay] Failed to parse incoming message', error);
        }
    });

    socket.on('close', () => {
        clients.delete(socket);
        console.log(`[ws-relay] Client disconnected: ${clientId}`);
    });

    socket.on('error', (error) => {
        console.error('[ws-relay] Socket error', clientId, error);
    });

    // 接続確認の初期メッセージ
    try {
        socket.send(JSON.stringify({
            id: randomUUID(),
            type: 'relay:welcome',
            timestamp: Date.now(),
            transport: 'websocket',
            data: {
                message: 'connected',
                role,
                player
            }
        }));
    } catch (error) {
        console.error('[ws-relay] Failed to send welcome message', error);
    }
});

server.listen(PORT, () => {
    console.log(`[ws-relay] WebSocket relay listening on ws://localhost:${PORT}${PATH}`);
});

const gracefulShutdown = () => {
    console.log('[ws-relay] Shutting down...');
    for (const socket of clients.keys()) {
        try {
            socket.close();
        } catch (error) {
            console.error('[ws-relay] Failed to close socket', error);
        }
    }
    server.close(() => {
        process.exit(0);
    });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
