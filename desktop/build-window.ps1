param([Parameter(Mandatory=$true)][string]$SdkPath,[Parameter(Mandatory=$true)][string]$IconIco,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$taskSdk=(Resolve-Path -LiteralPath $SdkPath).Path
$taskIcon=(Resolve-Path -LiteralPath $IconIco).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$taskOutput=(Resolve-Path -LiteralPath $OutputDirectory).Path
$taskCore=Join-Path $taskSdk 'lib/net462/Microsoft.Web.WebView2.Core.dll'
$taskForms=Join-Path $taskSdk 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $taskCompiler /nologo /target:winexe /platform:x64 "/out:$taskOutput/1stStep Studio.exe" "/win32icon:$taskIcon" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/reference:$taskCore" "/reference:$taskForms" (Join-Path $PSScriptRoot 'StudioWindow.cs')
if($LASTEXITCODE -ne 0){throw 'Studio window compilation failed.'}
Copy-Item -LiteralPath $taskCore,$taskForms,(Join-Path $taskSdk 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $taskOutput -Force
Copy-Item -LiteralPath $taskIcon -Destination (Join-Path $taskOutput 'firststep-studio.ico') -Force
