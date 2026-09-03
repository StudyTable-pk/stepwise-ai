param(
    [string]$InputPath,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($InputPath, $false, $true)
    $text = $doc.Content.Text
    [System.IO.File]::WriteAllText($OutputPath, $text, [System.Text.Encoding]::UTF8)
    Write-Host "OK $((Get-Item $OutputPath).Length) bytes"
} finally {
    if ($word -ne $null) {
        try { $word.Quit() } catch {}
    }
    Get-Process winword -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
