param (
    [Parameter(Position=0, Mandatory=$false)]
    [string]$CommitMsg = "chore: auto format, check, build and push"
)

Write-Host "=== Bắt đầu quy trình kiểm tra và build ===" -ForegroundColor Cyan
.\check_build.ps1

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[LỖI] Quy trình check và build thất bại! Đã hủy bỏ commit và push." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n=== Đẩy lên Git ===" -ForegroundColor Cyan
Write-Host "1. Git Add All..."
git add -A

Write-Host "2. Git Commit..."
git commit -m $CommitMsg

Write-Host "3. Git Push..."
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[LỖI] Git push thất bại!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n[OK] Toàn bộ quy trình hoàn tất thành công!" -ForegroundColor Green
