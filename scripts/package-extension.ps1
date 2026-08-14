[CmdletBinding()]
param(
    [Parameter()]
    [string] $OutputPath = 'dist/lastTab.zip'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$archivePath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    [System.IO.Path]::GetFullPath($OutputPath)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
}

$archiveDirectory = Split-Path -Parent $archivePath
if (-not (Test-Path -LiteralPath $archiveDirectory)) {
    New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null
}

$rootFiles = @(
    'manifest.json'
    'background.js'
    'options.html'
    'options.js'
    'options.css'
)

$packageFiles = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $rootFiles) {
    $sourcePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Required extension file is missing: $relativePath"
    }
    $packageFiles.Add($sourcePath)
}

foreach ($assetDirectory in @('_locales', 'icons')) {
    $directoryPath = Join-Path $repoRoot $assetDirectory
    if (-not (Test-Path -LiteralPath $directoryPath -PathType Container)) {
        throw "Required extension directory is missing: $assetDirectory"
    }
    Get-ChildItem -LiteralPath $directoryPath -File -Recurse | ForEach-Object {
        $packageFiles.Add($_.FullName)
    }
}

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
    $archivePath,
    [System.IO.Compression.ZipArchiveMode]::Create
)

try {
    foreach ($sourcePath in ($packageFiles | Sort-Object -Unique)) {
        $entryName = [System.IO.Path]::GetRelativePath($repoRoot, $sourcePath).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $sourcePath,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

Write-Output $archivePath
