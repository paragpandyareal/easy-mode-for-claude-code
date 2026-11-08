# Byte Runner setup for Windows
# Installs what Byte Runner needs (Node.js, Git, Claude Code), adds a desktop shortcut, then starts it.
# Safe to run again any time: it skips anything already installed.

$ErrorActionPreference = 'Continue'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Host.UI.RawUI.WindowTitle = 'Byte Runner setup'

function Say($text, $color = 'White') { Write-Host "  $text" -ForegroundColor $color }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $local = Join-Path $env:USERPROFILE '.local\bin'
  if ((Test-Path $local) -and ($env:Path -notlike "*$local*")) { $env:Path += ";$local" }
}

Write-Host ''
Say 'BYTE RUNNER  -  setting things up' 'Cyan'
Say 'This takes a few minutes the first time. You can leave it running.' 'DarkGray'
Write-Host ''

$hasWinget = Has 'winget'
if (-not $hasWinget) {
  Say 'Windows "winget" was not found. Install "App Installer" from the Microsoft Store, then run this again.' 'Yellow'
}

# 1. Node.js
Refresh-Path
if (Has 'node') { Say "[ok] Node.js $(node --version)" 'Green' }
elseif ($hasWinget) {
  Say 'Installing Node.js...' 'Cyan'
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent | Out-Null
  Refresh-Path
  if (Has 'node') { Say "[ok] Node.js $(node --version)" 'Green' } else { Say '[!] Node.js did not install. Get it from https://nodejs.org and run this again.' 'Red' }
}

# 2. Git (used for Undo and by Claude Code itself)
Refresh-Path
if (Has 'git') { Say "[ok] Git" 'Green' }
elseif ($hasWinget) {
  Say 'Installing Git (this powers the Undo button)...' 'Cyan'
  winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements --silent | Out-Null
  Refresh-Path
  if (Has 'git') { Say '[ok] Git' 'Green' } else { Say '[!] Git did not install. Undo will be switched off until it is.' 'Yellow' }
}

# 3. Claude Code (the official one from Anthropic)
Refresh-Path
if (Has 'claude') { Say "[ok] Claude Code $(claude --version)" 'Green' }
else {
  Say 'Installing Claude Code...' 'Cyan'
  if ($hasWinget) { winget install --id Anthropic.ClaudeCode -e --accept-source-agreements --accept-package-agreements --silent | Out-Null; Refresh-Path }
  if (-not (Has 'claude')) {
    try { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression } catch { }
    Refresh-Path
  }
  if (Has 'claude') { Say "[ok] Claude Code $(claude --version)" 'Green' } else { Say '[!] Claude Code did not install. See https://docs.claude.com/en/docs/claude-code/setup' 'Red' }
}

# 4. Desktop shortcut
try {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $desktop 'Byte Runner.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = Join-Path $Here 'Start Byte Runner.bat'
  $s.WorkingDirectory = $Here
  $s.Description = 'A friendly home for Claude Code'
  $s.Save()
  Say '[ok] Added a "Byte Runner" shortcut to your desktop' 'Green'
} catch { Say 'Could not add a desktop shortcut. You can start it with "Start Byte Runner.bat".' 'Yellow' }

Write-Host ''
Say 'First time using Claude Code? You need to sign in once.' 'Cyan'
$answer = Read-Host '  Open the sign in window now? (Y/n)'
if ($answer -eq '' -or $answer -match '^[Yy]') {
  Say 'A new window opens. Choose your Claude subscription (or an API key), finish in the browser, then close that window.' 'DarkGray'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'claude' -WorkingDirectory $env:USERPROFILE
  Read-Host '  Press Enter here when you have signed in'
}

Write-Host ''
Say 'All set! Starting Byte Runner...' 'Green'
Start-Process -FilePath (Join-Path $Here 'Start Byte Runner.bat') -WorkingDirectory $Here
Start-Sleep -Seconds 2
