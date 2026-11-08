param([int]$ServerPid,[string]$OutputFile,[string]$StopFile)
$ErrorActionPreference='SilentlyContinue'
'utc,workingSetBytes,privateBytes,sumProcessPeakWorkingSetBytes,cpuSeconds,processCount' | Set-Content -LiteralPath $OutputFile -Encoding utf8
while(-not (Test-Path -LiteralPath $StopFile)){
  $ids=@($ServerPid)
  $processes=Get-CimInstance Win32_Process
  for($i=0;$i -lt 3;$i++){$ids=@($ids+@($processes | Where-Object {$ids -contains $_.ParentProcessId} | ForEach-Object {$_.ProcessId}) | Select-Object -Unique)}
  $active=@($ids | ForEach-Object {Get-Process -Id $_})
  if($active.Count -eq 0){break}
  $working=($active | Measure-Object -Property WorkingSet64 -Sum).Sum
  $private=($active | Measure-Object -Property PrivateMemorySize64 -Sum).Sum
  $peak=($active | Measure-Object -Property PeakWorkingSet64 -Sum).Sum
  $cpu=($active | Measure-Object -Property CPU -Sum).Sum
  "$([DateTime]::UtcNow.ToString('o')),$working,$private,$peak,$cpu,$($active.Count)" | Add-Content -LiteralPath $OutputFile -Encoding utf8
  Start-Sleep -Seconds 2
}
