param([string]$IconPng,[string]$IconIco,[switch]$Launch)
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot
$taskRoot=Join-Path $env:LOCALAPPDATA '1stStep\Newsletter Studio'
$taskApp=Join-Path $taskRoot 'app'
$taskNode=(Get-Command node.exe -ErrorAction Stop).Source
$taskScriptHost=Join-Path $env:WINDIR 'System32\wscript.exe'
if(-not(Test-Path -LiteralPath (Join-Path $taskRepo 'dist\admin\index.html'))){throw 'Build the Studio before installing.'}
if(-not(Test-Path -LiteralPath $taskScriptHost)){throw 'Windows Script Host is unavailable.'}
New-Item -ItemType Directory -Path $taskApp -Force | Out-Null
$taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
# Desktop credentials and launch state belong only to this Windows user and SYSTEM.
icacls.exe $taskRoot /inheritance:r /grant:r "*${taskSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect the desktop app folder.'}
Copy-Item -Path (Join-Path $PSScriptRoot '*.mjs'),(Join-Path $PSScriptRoot 'credential.ps1'),(Join-Path $PSScriptRoot 'pair.*') -Destination $taskApp -Force
$taskSite=Join-Path $taskRoot 'site'
New-Item -ItemType Directory -Path $taskSite -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepo 'dist\admin'),(Join-Path $taskRepo 'dist\assets') -Destination $taskSite -Recurse -Force
if($IconPng){Copy-Item -LiteralPath $IconPng -Destination (Join-Path $taskRoot 'app-icon.png') -Force}
if($IconIco){Copy-Item -LiteralPath $IconIco -Destination (Join-Path $taskRoot 'newsletter-studio-custom.ico') -Force}
$taskLaunch=Join-Path $taskRoot 'launch.vbs'
$taskCommand='"'+$taskNode+'" "'+(Join-Path $taskApp 'desktop.mjs')+'"'
$taskVbs='CreateObject("WScript.Shell").Run "'+$taskCommand.Replace('"','""')+'", 0, False'
Set-Content -LiteralPath $taskLaunch -Value $taskVbs -Encoding ASCII
$taskShortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Newsletter Studio.lnk'
$taskShell=New-Object -ComObject WScript.Shell
$taskLink=$taskShell.CreateShortcut($taskShortcut)
$taskLink.TargetPath=$taskScriptHost
$taskLink.Arguments='"'+$taskLaunch+'"'
$taskLink.WorkingDirectory=$taskRoot
$taskLink.IconLocation=(Join-Path $taskRoot 'newsletter-studio-custom.ico')+',0'
$taskLink.Description='Open the cloud-synced Newsletter Studio desktop app; pair this PC once.'
$taskLink.Save()
$taskCheck=$taskShell.CreateShortcut($taskShortcut)
if($taskCheck.TargetPath -ne $taskScriptHost){throw 'Desktop shortcut verification failed.'}
Write-Output 'Newsletter Studio desktop program installed. Connection is unpaired until the owner approves this PC.'
if($Launch){Start-Process -FilePath $taskScriptHost -ArgumentList ('"'+$taskLaunch+'"') -WindowStyle Hidden}
