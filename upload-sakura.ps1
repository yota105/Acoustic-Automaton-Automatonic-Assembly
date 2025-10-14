# さくらVPSアップロードスクリプト (PowerShell版)

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

# distフォルダをアップロード
Write-Host "   dist/ をアップロード中..." -ForegroundColor Gray
scp -r .\dist\* "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/dist/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ アップロードに失敗しました" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ アップロード完了!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 アクセスURL:" -ForegroundColor Cyan
Write-Host "   Home:        http://${VPS_HOST}/" -ForegroundColor White
Write-Host "   Controller:  http://${VPS_HOST}/src/controller.html" -ForegroundColor White
Write-Host "   Player 1:    http://${VPS_HOST}/src/player.html?player=1" -ForegroundColor White
Write-Host "   Player 2:    http://${VPS_HOST}/src/player.html?player=2" -ForegroundColor White
Write-Host "   Player 3:    http://${VPS_HOST}/src/player.html?player=3" -ForegroundColor White
Write-Host "   Visualizer:  http://${VPS_HOST}/src/visualizer.html" -ForegroundColor White
Write-Host ""
