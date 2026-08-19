$ErrorActionPreference = 'Continue'
Start-Sleep -Seconds 2
Write-Output "[restart] $(Get-Date -Format 'HH:mm:ss') finding listener on 3080"
$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $target = $conn.OwningProcess
  Write-Output "[restart] killing PID $target"
  Stop-Process -Id $target -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
} else {
  Write-Output "[restart] nothing listening on 3080"
}
$node = 'C:\Program Files\nodejs\node.exe'
$bin = 'C:\Users\Admin\AppData\Local\dsh-npx-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js'
$logOut = 'C:\Users\Admin\.dsh\dsh-web.log'
$logErr = 'C:\Users\Admin\.dsh\dsh-web.err.log'
$argList = @('"' + $bin + '"', 'web')
Start-Process -FilePath $node -ArgumentList $argList -WorkingDirectory 'C:\Users\Admin\Desktop\api中转站' -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logErr
Start-Sleep -Seconds 14
$port = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($port) {
  Write-Output "[restart] OK: 3080 listening (PID $($port.OwningProcess))"
} else {
  Write-Output "[restart] FAIL: 3080 not listening after 14s"
}
Write-Output "===== stderr log tail ====="
if (Test-Path $logErr) { Get-Content $logErr -Tail 40 } else { Write-Output '(no stderr log)' }
Write-Output "===== stdout log tail ====="
if (Test-Path $logOut) { Get-Content $logOut -Tail 40 } else { Write-Output '(no stdout log)' }
