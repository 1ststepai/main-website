param([ValidateSet('Protect','Unprotect')][string]$Mode)
$ErrorActionPreference='Stop'
$taskInput=[Console]::In.ReadToEnd().Trim()
[Reflection.Assembly]::LoadWithPartialName('System.Security') | Out-Null
if($Mode -eq 'Protect') {
  $taskBytes=[Text.Encoding]::UTF8.GetBytes($taskInput)
  $taskEncrypted=[Security.Cryptography.ProtectedData]::Protect($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($taskEncrypted))
} else {
  $taskEncrypted=[Convert]::FromBase64String($taskInput)
  $taskBytes=[Security.Cryptography.ProtectedData]::Unprotect($taskEncrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($taskBytes))
}
