#!/bin/bash
set -e

echo "🚀 Deploying Acoustic Automaton..."

# コード更新
echo "📥 Pulling latest code..."
git pull origin feature/work-architecture

# 依存関係インストール
echo "📦 Installing dependencies..."
npm install

# ビルド
echo "🔨 Building application..."
npm run build

# PM2再起動
echo "🔄 Restarting WebSocket relay..."
pm2 restart ws-relay 2>/dev/null || pm2 start tools/websocket-relay.mjs --name "ws-relay"
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📱 Access URLs:"
IP=$(hostname -I | awk '{print $1}')
echo "   Controller:  http://$IP/src/controller.html"
echo "   Player 1:    http://$IP/src/player.html?player=1"
echo "   Player 2:    http://$IP/src/player.html?player=2"
echo "   Player 3:    http://$IP/src/player.html?player=3"
echo "   Visualizer:  http://$IP/src/visualizer.html"
echo ""
echo "🔗 WebSocket relay: ws://$IP/performance"
