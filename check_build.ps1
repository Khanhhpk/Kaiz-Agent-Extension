param (
    [switch]$SkipBuild = $false
)

Write-Host "=== 1. Formatting Code ===" -ForegroundColor Cyan
npm run format

Write-Host "`n=== 2. TypeScript Check ===" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript check failed! Vui lòng sửa lỗi trước khi build." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n=== 3. ESLint Check ===" -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "ESLint check failed! Vui lòng sửa lỗi trước khi build." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n[OK] Mọi bài kiểm tra đều vượt qua!" -ForegroundColor Green

if (-not $SkipBuild) {
    Write-Host "`n=== 4. Building ===" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "`n[OK] Build thành công!" -ForegroundColor Green
}
