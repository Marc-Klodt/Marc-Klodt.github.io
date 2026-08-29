param(
  [switch]$NoBrowser,
  [switch]$Admin
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -ErrorAction SilentlyContinue
if (-not (Test-Path (Join-Path $PSScriptRoot "..\index.html"))) {
  $root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$exe = Join-Path $PSScriptRoot "GoGiLock.exe"
$src = Join-Path $PSScriptRoot "GoGiLockServer.cs"
$webExt = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll"

if (-not (Test-Path $csc)) { throw "C# Compiler nicht gefunden." }

$needsBuild = $true
if ((Test-Path $exe) -and ((Get-Item $exe).LastWriteTimeUtc -ge (Get-Item $src).LastWriteTimeUtc)) {
  $needsBuild = $false
}

if ($needsBuild) {
  Write-Host "GoGiLock wird gebaut ..."
  & $csc /nologo /optimize+ /out:$exe /target:exe /r:System.dll /r:System.Core.dll /r:$webExt $src
  if ($LASTEXITCODE -ne 0) { throw "Build fehlgeschlagen." }
}

$port = 8080
$homeUrl = "http://127.0.0.1:$port/"
$url = if ($Admin) { $homeUrl + "admin" } else { $homeUrl }
$already = $false
try {
  $req = [System.Net.WebRequest]::Create($homeUrl + "api/health")
  $req.Timeout = 800
  $resp = $req.GetResponse()
  $resp.Close()
  $already = $true
} catch { }

if (-not $already) {
  $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($inUse) {
    Write-Host "Port $port ist belegt. Versuche trotzdem zu oeffnen."
  } else {
    Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    $ok = $false
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Milliseconds 150
      try {
        $req = [System.Net.WebRequest]::Create($homeUrl + "api/health")
        $req.Timeout = 500
        $resp = $req.GetResponse()
        $resp.Close()
        $ok = $true
        break
      } catch { }
    }
    if (-not $ok) { throw "GoGiLock-Server ist nicht gestartet." }
  }
}

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $NoBrowser) {
  if (-not $chrome) { throw "Google Chrome wurde nicht gefunden." }
  Start-Process -FilePath $chrome -ArgumentList @("--new-window", $url)
}

Write-Host "GoGiLock: $url"
