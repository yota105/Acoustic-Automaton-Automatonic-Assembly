#!/bin/bash
set -e

# VPS設定（編集してください）
VPS_USER="your-username"
VPS_HOST="your-vps-ip"
VPS_PATH="/var/www/acoustic-automaton"

echo "🚀 Uploading to VPS..."

# ビルド
echo "🔨 Building locally..."
npm run build

# distフォルダをアップロード
echo "📤 Uploading dist folder..."
rsync -avz --delete dist/ ${VPS_USER}@${VPS_HOST}:${VPS_PATH}/dist/

# WebSocketリレーファイルをアップロード
echo "📤 Uploading WebSocket relay..."
rsync -avz tools/websocket-relay.mjs ${VPS_USER}@${VPS_HOST}:${VPS_PATH}/tools/

# package.jsonをアップロード
echo "📤 Uploading package files..."
rsync -avz package*.json ${VPS_USER}@${VPS_HOST}:${VPS_PATH}/

# VPS上でnpm installとPM2再起動
echo "🔄 Restarting services on VPS..."
ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
cd /var/www/acoustic-automaton
npm install --production
pm2 restart ws-relay || pm2 start tools/websocket-relay.mjs --name "ws-relay"
pm2 save
ENDSSH

echo ""
echo "✅ Upload complete!"
echo ""
echo "📱 Access URLs:"
echo "   Controller:  http://${VPS_HOST}/src/controller.html"
echo "   Player 1:    http://${VPS_HOST}/src/player.html?player=1"
echo "   Player 2:    http://${VPS_HOST}/src/player.html?player=2"
echo "   Player 3:    http://${VPS_HOST}/src/player.html?player=3"
