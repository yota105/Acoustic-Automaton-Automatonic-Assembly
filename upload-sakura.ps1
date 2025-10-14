# さくらVPSアップロードスクリプト (PowerShell版)
# 使用前にSSH鍵認証を設定しておくことを推奨

$VPS_USER = "ubuntu"
$VPS_HOST = "160.16.107.210"
$VPS_PATH = "/var/www/acoustic-automaton"

Write-Host "🚀 さくらVPSへアップロード開始..." -ForegroundColor Green
Write-Host ""

# ビルド
Write-Host "🔨 ローカルでビルド中..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ビルドに失敗しました" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📤 ファイルをVPSにアップロード中..." -ForegroundColor Yellow
Write-Host "   (初回接続時はホストの確認を求められます)" -ForegroundColor Cyan

# scpでファイルをアップロード
# オプション: Git Bash や WSL の rsync を使う場合はコメントアウトを外してください
# bash -c "rsync -avz --delete dist/ ${VPS_USER}@${VPS_HOST}:${VPS_PATH}/dist/"

# PowerShell版 (scpコマンドを使用)
Write-Host "   dist/ をアップロード中..." -ForegroundColor Gray
scp -r .\dist\* "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/dist/"

Write-Host "   tools/ をアップロード中..." -ForegroundColor Gray
scp .\tools\websocket-relay.mjs "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/tools/"

Write-Host "   設定ファイルをアップロード中..." -ForegroundColor Gray
scp .\package.json "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"
scp .\package-lock.json "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"
scp .\nginx.conf "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

Write-Host ""
Write-Host "🔄 VPS上でサービスを再起動中..." -ForegroundColor Yellow

# SSH経由でVPS上のコマンドを実行
$sshCommands = @"
cd ${VPS_PATH}
npm install --production
pm2 restart ws-relay 2>/dev/null || pm2 start tools/websocket-relay.mjs --name 'ws-relay'
pm2 save
"@

ssh "${VPS_USER}@${VPS_HOST}" $sshCommands

Write-Host ""
Write-Host "✅ アップロード完了!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 アクセスURL:" -ForegroundColor Cyan
Write-Host "   Controller:  http://${VPS_HOST}/src/controller.html" -ForegroundColor White
Write-Host "   Player 1:    http://${VPS_HOST}/src/player.html?player=1" -ForegroundColor White
Write-Host "   Player 2:    http://${VPS_HOST}/src/player.html?player=2" -ForegroundColor White
Write-Host "   Player 3:    http://${VPS_HOST}/src/player.html?player=3" -ForegroundColor White
Write-Host "   Visualizer:  http://${VPS_HOST}/src/visualizer.html" -ForegroundColor White
Write-Host ""
Write-Host "🔗 WebSocket:    ws://${VPS_HOST}/performance" -ForegroundColor White
Write-Host ""
