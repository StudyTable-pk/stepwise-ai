$ErrorActionPreference = 'Stop'
$src = 'C:\Users\Master\Desktop\stepwise ai'
$dst = 'c:\Users\Master\lumina fx bot\stepwise ai\specs'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

$files = @(Get-ChildItem -Path $src -Filter '*.doc' -Recurse)
foreach ($f in $files) {
    $outName = [System.IO.Path]::GetFileNameWithoutExtension($f.Name) + '.txt'
    $outPath = Join-Path $dst $outName
    $doc = $word.Documents.Open($f.FullName, $false, $true)
    $text = $doc.Content.Text
    [System.IO.File]::WriteAllText($outPath, $text, [System.Text.Encoding]::UTF8)
    $doc.Close($false)
    Write-Host "Converted: $($f.Name) -> $outName ($((Get-Item $outPath).Length) bytes)"
}
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Host 'DONE'
