!include "MUI2.nsh"

!define APPNAME "PostPath"
!define VERSION "0.1.0"
!define SRCDIR "dist/win-unpacked"

Name "${APPNAME}"
OutFile "../dist/PostPath-${VERSION}-windows-unsigned-internal-preview.exe"
InstallDir "$LOCALAPPDATA\Programs\PostPath"
RequestExecutionLevel user
Unicode True
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install PostPath"
!define MUI_WELCOMEPAGE_TEXT "This is an unsigned internal preview of PostPath.$\r$\n$\r$\nWindows SmartScreen may warn because the file is not signed. Leave SmartScreen enabled.$\r$\n$\r$\nPostPath opens from the Start menu or the desktop. Closing the window quits it. Uninstalling does not delete saved accounts."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "PostPath"
  SetOutPath "$INSTDIR"
  File /r ../dist/win-unpacked/*.*
  CreateShortcut "$SMPROGRAMS\PostPath.lnk" "$INSTDIR\PostPath.exe" "" "$INSTDIR\PostPath.exe" 0
  CreateShortcut "$DESKTOP\PostPath.lnk" "$INSTDIR\PostPath.exe" "" "$INSTDIR\PostPath.exe" 0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PostPath" "DisplayName" "PostPath ${VERSION} unsigned internal preview"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PostPath" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PostPath" "DisplayVersion" "${VERSION}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PostPath" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PostPath" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\PostPath.lnk"
  Delete "$DESKTOP\PostPath.lnk"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PostPath"
  MessageBox MB_OK "PostPath was removed. Saved accounts are still in %USERPROFILE%\.social-mcp. Install PostPath again and choose Remove saved accounts to delete them."
SectionEnd
