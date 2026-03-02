# RepoSync_Fixed_PS5_Compatible.ps1
# Kisa aciklama (~15 kelime): PS5 uyumlu, ?? operatoru yok, UI + konsol fallback, zip yedek + sync.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------- SAFE PATH RESOLVE (PS5 compatible) ----------------
if ($PSCommandPath) {
    $ScriptPath = $PSCommandPath
} else {
    $ScriptPath = $MyInvocation.MyCommand.Path
}

if (-not $ScriptPath) {
    $ScriptPath = Join-Path (Get-Location) "RepoSync.ps1"
}

$Root = Split-Path -Parent $ScriptPath

# ---------------- CONFIG ----------------
$BaseUrl   = "https://github.com/salihcelebi"
$BackupDir = Join-Path $Root "backups"
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# ---------------- LOG ----------------
$script:LogToUI = $null
function Log([string]$m) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m
    if ($script:LogToUI) {
        $script:LogToUI.Invoke($line)
    } else {
        Write-Host $line
    }
}

# ---------------- GIT FIND ----------------
function Get-GitCmd {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) { return $git.Source }

    $candidates = @(
        "$env:ProgramFiles\Git\cmd\git.exe",
        "$env:ProgramFiles\Git\bin\git.exe",
        "$env:LocalAppData\Programs\Git\cmd\git.exe",
        "$env:LocalAppData\Programs\Git\bin\git.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

# ---------------- ZIP BACKUP ----------------
function Backup-Zip([string]$Folder, [string]$Name) {
    if (-not (Test-Path $Folder)) { return }

    $ts  = Get-Date -Format "yyyyMMdd_HHmmss"
    $zip = Join-Path $BackupDir "${Name}_${ts}.zip"
    Log "YEDEK -> $zip"

    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
        if (Test-Path $zip) { Remove-Item $zip -Force }
        [IO.Compression.ZipFile]::CreateFromDirectory($Folder, $zip, [IO.Compression.CompressionLevel]::NoCompression, $false)
        Log "YEDEK OK"
    } catch {
        throw "ZIP hatasi: $($_.Exception.Message)"
    }
}

# ---------------- DEFAULT BRANCH ----------------
function Get-DefaultBranch($gitExe) {
    try {
        $ref = (& $gitExe symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>$null)
        if ($ref) { return ($ref -replace '^origin/','') }
    } catch {}
    return "main"
}

# ---------------- SYNC ----------------
function Sync-Repo([string]$Repo) {
    $gitExe = Get-GitCmd
    if (-not $gitExe) { throw "Git bulunamadi." }

    if (-not ($Repo -match '^[A-Za-z0-9._-]+$')) {
        throw "Repo adi gecersiz."
    }

    $url  = "$BaseUrl/$Repo"
    $dest = Join-Path $Root $Repo

    Log "Repo : $url"
    Log "Hedef: $dest"

    if (Test-Path $dest) {
        Backup-Zip $dest $Repo
    }

    if (Test-Path (Join-Path $dest ".git")) {
        Push-Location $dest
        try {
            & $gitExe remote set-url origin $url 2>$null
            & $gitExe fetch --all --prune
            $br = Get-DefaultBranch $gitExe
            & $gitExe reset --hard "origin/$br"
            & $gitExe clean -fd
            Log "OK: Uzerine yazildi."
        } finally { Pop-Location }
    } else {
        if (Test-Path $dest) {
            Remove-Item $dest -Recurse -Force
        }
        & $gitExe clone --depth 1 --single-branch $url $dest
        Log "OK: Klonlandi."
    }

    return $dest
}

# ---------------- UI ----------------
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Repo Sync"
    $form.Size = New-Object System.Drawing.Size(800, 520)
    $form.StartPosition = "CenterScreen"

    $txtRepo = New-Object System.Windows.Forms.TextBox
    $txtRepo.Location = New-Object System.Drawing.Point(20, 20)
    $txtRepo.Size = New-Object System.Drawing.Size(500, 25)
    $form.Controls.Add($txtRepo)

    $btnRun = New-Object System.Windows.Forms.Button
    $btnRun.Text = "Yedekle + Sync"
    $btnRun.Location = New-Object System.Drawing.Point(540, 18)
    $btnRun.Size = New-Object System.Drawing.Size(120, 28)
    $form.Controls.Add($btnRun)

    $txtLog = New-Object System.Windows.Forms.TextBox
    $txtLog.Location = New-Object System.Drawing.Point(20, 70)
    $txtLog.Size = New-Object System.Drawing.Size(740, 380)
    $txtLog.Multiline = $true
    $txtLog.ScrollBars = "Vertical"
    $txtLog.ReadOnly = $true
    $form.Controls.Add($txtLog)

    $script:LogToUI = {
        param($line)
        $txtLog.AppendText($line + "`r`n")
        $txtLog.ScrollToCaret()
    }

    $btnRun.Add_Click({
        try {
            $repo = $txtRepo.Text.Trim()
            if (-not $repo) { throw "Repo adi girin." }
            Log "----------------"
            Sync-Repo $repo | Out-Null
        } catch {
            Log "HATA: $($_.Exception.Message)"
        }
    })

    [void]$form.ShowDialog()
}
catch {
    # UI acilmazsa konsol fallback
    Log "UI acilamadi, konsol moduna gecildi."
    try {
        $repo = Read-Host "Repo adi"
        Sync-Repo $repo | Out-Null
        Log "Bitti."
    } catch {
        Log "HATA: $($_.Exception.Message)"
    }
    Read-Host "Cikmak icin Enter"
}
