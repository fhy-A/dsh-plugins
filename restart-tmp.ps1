$ErrorActionPreference = 'Continue'
Start-Sleep -Seconds 2
$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Output "[restart] killed $($conn.OwningProcess)"; Start-Sleep -Seconds 3 } else { Write-Output "[restart] nothing on 3080" }
Start-Process -FilePath 'C:\Users\Admin\Desktop\DeepSeek Harness Web.lnk'
Write-Output "[restart] launched shortcut"
Start-Sleep -Seconds 14
$p = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($p) { Write-Output "[restart] OK: 3080 (PID $($p.OwningProcess))" } else { Write-Output "[restart] FAIL" }
