#############################################
# ASCII MAKET (UI TASLAĞI)
#############################################
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ REPO SYNC (PS5)                                                         │
# ├──────────────────────────────────────────────────────────────────────────┤
# │ REPO ADI: [______________________________]  (ÖRN: PATPAT)               │
# │                                                                          │
# │ EYLEM SEÇ:   [ ÇEK (PULL) ]   [ GÖNDER (PUSH) ]   [ TÜM İÇERİĞİ GÖNDER ] │
# │                                                                          │
# │ COMMIT MESAJI (PUSH): [_______________________________]  (OPSİYONEL)     │
# │                                                                          │
# │ İLERLEME: [██████████████████████----------------------]  45%  DURUM: ...│
# │                                                                          │
# │ LOG:                                                                     │
# │ ┌──────────────────────────────────────────────────────────────────────┐ │
# │ │ [19:01:10] ...                                                        │ │
# │ │ [19:01:12] ...                                                        │ │
# │ │ ...                                                                    │ │
# │ └──────────────────────────────────────────────────────────────────────┘ │
# │                                                                          │
# │ [ LOGU TEMİZLE ]  [ LOGU KOPYALA ]                                       │
# └──────────────────────────────────────────────────────────────────────────┘
#
# NOTLAR:
# - OTOMATİK ÇEKME YOK: KULLANICI BUTONA BASMADAN İŞLEM YAPMA.
# - "İLERLEME" HEM ÇEKMEDE HEM GÖNDERMEDE GÖRÜNSÜN.
# - "TÜM İÇERİĞİ GÖNDER": GIT ADD -A + COMMIT(+MESAJ) + PUSH.
#############################################


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
$script:SetProgressUI = $null

function Log([string]$m) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m
    if ($script:LogToUI) {
        $script:LogToUI.Invoke($line)
    } else {
        Write-Host $line
    }
}

# ---------------- PROGRESS (UI + CONSOLE) ----------------
# GEREKSİNİM: "İLERLEME BUTONU/İLERLEME GÖSTER" -> ProgressBar + yüzde + durum metni.
function Set-ProgressStep([int]$percent, [string]$status) {
    $p = [Math]::Max(0, [Math]::Min(100, $percent))
    if ($script:SetProgressUI) {
        $script:SetProgressUI.Invoke($p, $status)
    } else {
        # Konsol fallback: kısa ilerleme satırı
        Write-Host ("[{0}] Ilerleme: {1}% - {2}" -f (Get-Date -Format "HH:mm:ss"), $p, $status)
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
function Get-DefaultBranch($gitExe, [string]$dest) {
    Push-Location $dest
    try {
        $ref = (& $gitExe symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>$null)
        if ($ref) { return ($ref -replace '^origin/','') }
    } catch {}
    finally { Pop-Location }
    return "main"
}

# ---------------- VALIDATE REPO NAME ----------------
function Assert-RepoName([string]$Repo) {
    # GEREKSİNİM: HATA YÖNETİMİ -> geçersiz girişleri erken yakala.
    if (-not $Repo) { throw "Repo adi girin." }
    if (-not ($Repo -match '^[A-Za-z0-9._-]+$')) { throw "Repo adi gecersiz." }
}

# ---------------- ENSURE REPO EXISTS LOCALLY (CLONE OR RESET) ----------------
function Ensure-RepoLocal([string]$Repo) {
    $gitExe = Get-GitCmd
    if (-not $gitExe) { throw "Git bulunamadi." }

    Assert-RepoName $Repo

    $url  = "$BaseUrl/$Repo"
    $dest = Join-Path $Root $Repo

    Log "Repo : $url"
    Log "Hedef: $dest"

    if (Test-Path $dest) {
        Set-ProgressStep 5 "YEDEK ALINIYOR"
        Backup-Zip $dest $Repo
    }

    if (Test-Path (Join-Path $dest ".git")) {
        # Repo zaten var: sadece origin güncelle + fetch
        Push-Location $dest
        try {
            Set-ProgressStep 10 "REMOTE AYARLANIYOR"
            & $gitExe remote set-url origin $url 2>$null

            Set-ProgressStep 20 "FETCH (PRUNE) BASLADI"
            & $gitExe fetch --all --prune

            Log "OK: Repo hazir."
        } finally { Pop-Location }
    } else {
        if (Test-Path $dest) {
            Remove-Item $dest -Recurse -Force
        }

        Set-ProgressStep 15 "CLONE BASLADI"
        & $gitExe clone --depth 1 --single-branch $url $dest
        Log "OK: Klonlandi."
    }

    return $dest
}

# ---------------- PULL (SYNC) ----------------
function Pull-Repo([string]$Repo) {
    # GEREKSİNİM: "OTOMATİK ÇEKMEYECEK" -> sadece kullanıcı butonla çağırır.
    $gitExe = Get-GitCmd
    if (-not $gitExe) { throw "Git bulunamadi." }

    $dest = Ensure-RepoLocal $Repo
    Push-Location $dest
    try {
        $br = Get-DefaultBranch $gitExe $dest

        Set-ProgressStep 35 "RESET HARD origin/$br"
        & $gitExe reset --hard "origin/$br"

        Set-ProgressStep 55 "CLEAN -FD"
        & $gitExe clean -fd

        Set-ProgressStep 75 "PULL/RESET TAMAMLANDI"
        Log "OK: Uzerine yazildi."
    } finally { Pop-Location }

    Set-ProgressStep 100 "BİTTİ (ÇEKME)"
    return $dest
}

# ---------------- PUSH (SEND) ----------------
function Push-Repo([string]$Repo, [string]$CommitMessage, [switch]$SendAll) {
    # GEREKSİNİM: "GITHUB DA GÖNDERECEK" -> push akışı.
    # GEREKSİNİM: "TÜM İÇERİĞİ GÖNDERME BUTONU" -> -SendAll ile git add -A + commit + push.
    $gitExe = Get-GitCmd
    if (-not $gitExe) { throw "Git bulunamadi." }

    $dest = Ensure-RepoLocal $Repo
    Push-Location $dest
    try {
        $br = Get-DefaultBranch $gitExe $dest

        Set-ProgressStep 30 "BRANCH -> $br"
        # Branch'e geç (varsa)
        try { & $gitExe checkout $br 2>$null | Out-Null } catch {}

        # Değişiklik var mı?
        Set-ProgressStep 40 "STATUS KONTROL"
        $status = (& $gitExe status --porcelain)
        if (-not $status) {
            Set-ProgressStep 100 "GÖNDERİLECEK DEĞİŞİKLİK YOK"
            Log "INFO: Degisiklik yok, push atlandi."
            return $dest
        }

        # Tüm içerik: git add -A
        if ($SendAll) {
            Set-ProgressStep 55 "GIT ADD -A"
            & $gitExe add -A
        } else {
            # Normal push için de güvenli: add -A yapıyoruz; istersen daraltırsın.
            Set-ProgressStep 55 "GIT ADD -A"
            & $gitExe add -A
        }

        # Commit mesajı
        if (-not $CommitMessage) {
            $CommitMessage = "EK sync " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }

        Set-ProgressStep 70 "COMMIT"
        try {
            & $gitExe commit -m $CommitMessage | Out-Null
        } catch {
            # Commit çıkmayabilir (örn. nothing to commit). Bu durumda devam.
            Log "WARN: Commit atlandi (muhtemelen degisiklik yok)."
        }

        Set-ProgressStep 85 "PUSH origin/$br"
        & $gitExe push origin $br

        Set-ProgressStep 100 "BİTTİ (GÖNDERME)"
        Log "OK: Push tamam."
    } finally { Pop-Location }

    return $dest
}

# ---------------- UI ----------------
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Repo Sync (PS5)"
    $form.Size = New-Object System.Drawing.Size(820, 580)
    $form.StartPosition = "CenterScreen"

    # Repo input
    $lblRepo = New-Object System.Windows.Forms.Label
    $lblRepo.Text = "REPO ADI:"
    $lblRepo.Location = New-Object System.Drawing.Point(20, 18)
    $lblRepo.Size = New-Object System.Drawing.Size(80, 20)
    $form.Controls.Add($lblRepo)

    $txtRepo = New-Object System.Windows.Forms.TextBox
    $txtRepo.Location = New-Object System.Drawing.Point(110, 14)
    $txtRepo.Size = New-Object System.Drawing.Size(420, 25)
    $form.Controls.Add($txtRepo)

    # Buttons: Pull / Push / Send All
    $btnPull = New-Object System.Windows.Forms.Button
    $btnPull.Text = "ÇEK (PULL)"
    $btnPull.Location = New-Object System.Drawing.Point(550, 12)
    $btnPull.Size = New-Object System.Drawing.Size(110, 28)
    $form.Controls.Add($btnPull)

    $btnPush = New-Object System.Windows.Forms.Button
    $btnPush.Text = "GÖNDER (PUSH)"
    $btnPush.Location = New-Object System.Drawing.Point(670, 12)
    $btnPush.Size = New-Object System.Drawing.Size(120, 28)
    $form.Controls.Add($btnPush)

    $btnSendAll = New-Object System.Windows.Forms.Button
    $btnSendAll.Text = "TÜM İÇERİĞİ GÖNDER"
    $btnSendAll.Location = New-Object System.Drawing.Point(550, 46)
    $btnSendAll.Size = New-Object System.Drawing.Size(240, 28)
    $form.Controls.Add($btnSendAll)

    # Commit message
    $lblCommit = New-Object System.Windows.Forms.Label
    $lblCommit.Text = "COMMIT MESAJI:"
    $lblCommit.Location = New-Object System.Drawing.Point(20, 54)
    $lblCommit.Size = New-Object System.Drawing.Size(120, 20)
    $form.Controls.Add($lblCommit)

    $txtCommit = New-Object System.Windows.Forms.TextBox
    $txtCommit.Location = New-Object System.Drawing.Point(150, 50)
    $txtCommit.Size = New-Object System.Drawing.Size(380, 25)
    $form.Controls.Add($txtCommit)

    # Progress UI
    $lblProg = New-Object System.Windows.Forms.Label
    $lblProg.Text = "İLERLEME:"
    $lblProg.Location = New-Object System.Drawing.Point(20, 92)
    $lblProg.Size = New-Object System.Drawing.Size(90, 20)
    $form.Controls.Add($lblProg)

    $progress = New-Object System.Windows.Forms.ProgressBar
    $progress.Location = New-Object System.Drawing.Point(110, 90)
    $progress.Size = New-Object System.Drawing.Size(520, 20)
    $progress.Minimum = 0
    $progress.Maximum = 100
    $form.Controls.Add($progress)

    $lblProgText = New-Object System.Windows.Forms.Label
    $lblProgText.Text = "0% - HAZIR"
    $lblProgText.Location = New-Object System.Drawing.Point(640, 90)
    $lblProgText.Size = New-Object System.Drawing.Size(150, 20)
    $form.Controls.Add($lblProgText)

    # Log box
    $txtLog = New-Object System.Windows.Forms.TextBox
    $txtLog.Location = New-Object System.Drawing.Point(20, 130)
    $txtLog.Size = New-Object System.Drawing.Size(770, 360)
    $txtLog.Multiline = $true
    $txtLog.ScrollBars = "Vertical"
    $txtLog.ReadOnly = $true
    $form.Controls.Add($txtLog)

    # Log controls
    $btnClearLog = New-Object System.Windows.Forms.Button
    $btnClearLog.Text = "LOGU TEMİZLE"
    $btnClearLog.Location = New-Object System.Drawing.Point(20, 505)
    $btnClearLog.Size = New-Object System.Drawing.Size(120, 28)
    $form.Controls.Add($btnClearLog)

    $btnCopyLog = New-Object System.Windows.Forms.Button
    $btnCopyLog.Text = "LOGU KOPYALA"
    $btnCopyLog.Location = New-Object System.Drawing.Point(150, 505)
    $btnCopyLog.Size = New-Object System.Drawing.Size(120, 28)
    $form.Controls.Add($btnCopyLog)

    $btnClearLog.Add_Click({
        $txtLog.Clear()
        Log "LOG TEMİZLENDİ"
    })

    $btnCopyLog.Add_Click({
        try {
            [System.Windows.Forms.Clipboard]::SetText($txtLog.Text)
            Log "LOG PANoya KOPYALANDI"
        } catch {
            Log "HATA: LOG KOPYALANAMADI"
        }
    })

    # Wire UI log/progress
    $script:LogToUI = {
        param($line)
        $txtLog.AppendText($line + "`r`n")
        $txtLog.ScrollToCaret()
    }

    $script:SetProgressUI = {
        param($p, $status)
        $progress.Value = $p
        $lblProgText.Text = ("{0}% - {1}" -f $p, $status)
        $form.Refresh()
    }

    # Helper: run action safely (no auto)
    function Run-Action([scriptblock]$action) {
        try {
            Set-ProgressStep 0 "BASLADI"
            Log "----------------"
            & $action
        } catch {
            Set-ProgressStep 0 "HATA"
            Log "HATA: $($_.Exception.Message)"
        }
    }

    # Pull button
    $btnPull.Add_Click({
        Run-Action {
            $repo = $txtRepo.Text.Trim()
            Assert-RepoName $repo
            Log "EYLEM: CEK (PULL)"
            Pull-Repo $repo | Out-Null
        }
    })

    # Push button
    $btnPush.Add_Click({
        Run-Action {
            $repo = $txtRepo.Text.Trim()
            Assert-RepoName $repo
            $msg  = $txtCommit.Text.Trim()
            Log "EYLEM: GONDER (PUSH)"
            Push-Repo -Repo $repo -CommitMessage $msg | Out-Null
        }
    })

    # Send all button
    $btnSendAll.Add_Click({
        Run-Action {
            $repo = $txtRepo.Text.Trim()
            Assert-RepoName $repo
            $msg  = $txtCommit.Text.Trim()
            Log "EYLEM: TUM ICERIGI GONDER"
            Push-Repo -Repo $repo -CommitMessage $msg -SendAll | Out-Null
        }
    })

    [void]$form.ShowDialog()
}
catch {
    # UI acilmazsa konsol fallback
    Log "UI acilamadi, konsol moduna gecildi."

    try {
        $repo = Read-Host "Repo adi"
        Assert-RepoName $repo

        Write-Host "1) CEK (PULL)"
        Write-Host "2) GONDER (PUSH)"
        Write-Host "3) TUM ICERIGI GONDER"
        $choice = Read-Host "Secim (1/2/3)"

        if ($choice -eq "1") {
            Log "EYLEM: CEK (PULL)"
            Pull-Repo $repo | Out-Null
        } elseif ($choice -eq "2") {
            $msg = Read-Host "Commit mesaji (bos birakabilirsiniz)"
            Log "EYLEM: GONDER (PUSH)"
            Push-Repo -Repo $repo -CommitMessage $msg | Out-Null
        } elseif ($choice -eq "3") {
            $msg = Read-Host "Commit mesaji (bos birakabilirsiniz)"
            Log "EYLEM: TUM ICERIGI GONDER"
            Push-Repo -Repo $repo -CommitMessage $msg -SendAll | Out-Null
        } else {
            throw "Gecersiz secim."
        }

        Log "Bitti."
    } catch {
        Log "HATA: $($_.Exception.Message)"
    }

    Read-Host "Cikmak icin Enter"
}