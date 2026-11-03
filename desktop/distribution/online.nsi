; Small online setup. The frozen, qualified offline installer owns installation,
; upgrades, shortcuts and uninstall. This launcher changes no app files until
; the downloaded payload has passed both length and pinned SHA-512 checks.
Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma
ManifestDPIAware true
!include "defines.nsh"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "StdUtils.nsh"
Name "kimo ${APP_VERSION} online setup"
Caption "kimo setup"
OutFile "${OUTPUT_EXE}"
InstallDir "$LOCALAPPDATA\Programs\kimo"
InstallDirRegKey HKCU "Software\${APP_GUID}" "InstallLocation"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "kimo online setup"
VIAddVersionKey /LANG=1033 "FileDescription" "kimo online setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "kimo"
!define MUI_WELCOMEPAGE_TITLE "install kimo ${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Setup will download the app and its offline tools (about 369 MB), verify them, and install kimo.$\r$\n$\r$\nAn internet connection is required. Your existing installation stays in place if the download fails or is cancelled."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\kimo.exe"
!define MUI_FINISHPAGE_RUN_TEXT "open kimo"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
Var payload
Var downloadStatus
Var digest
Var payloadSize
Var mutex
Var installExit
Var installing

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "kimo requires 64-bit Windows." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\kimo-online-setup-${APP_GUID}") p .r0 ?e'
  Pop $1
  StrCpy $mutex $0
  ${If} $mutex = 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $1 = 183
    MessageBox MB_OK "kimo setup is already running." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

Function .onUserAbort
  ; Let the inner installer finish its atomic setup flow once started.
  ${If} $installing == "1"
    Abort
  ${EndIf}
  SetErrorLevel 1
FunctionEnd

; Called only after InetC reports completion. Do not trust status alone, HTTP
; redirects, a local cache, --package-file, or a mutable release URL.
Function VerifyPayload
  StrCpy $digest ""
  ClearErrors
  FileOpen $0 "$payload" r
  IfErrors invalid
  FileSeek $0 0 END $payloadSize
  FileClose $0
  ${If} $payloadSize != ${PAYLOAD_BYTES}
    Goto invalid
  ${EndIf}
  ${StdUtils.HashFile} $digest "SHA2-512" "$payload"
  ${If} $digest == "${PAYLOAD_SHA512}"
    Return
  ${EndIf}
  invalid:
  StrCpy $downloadStatus "package verification failed"
  StrCpy $digest ""
FunctionEnd

!macro Fetch URL
  ; /RESUME prompts only in interactive mode. Silent checks must fail instead
  ; of hanging on a network dialog. TLS validation is never weakened.
  ${If} ${Silent}
    inetc::get /SILENT /CONNECTTIMEOUT 15 /RECEIVETIMEOUT 30 /USERAGENT "kimo-setup/${APP_VERSION}" "${URL}" "$payload" /END
  ${Else}
    inetc::get /CONNECTTIMEOUT 15 /RECEIVETIMEOUT 30 /RESUME "Reconnect and choose Retry to continue downloading kimo." /USERAGENT "kimo-setup/${APP_VERSION}" "${URL}" "$payload" /END
  ${EndIf}
  Pop $downloadStatus
  ${If} $downloadStatus == "Cancelled"
    Delete "$payload"
    SetErrorLevel 1
    Quit
  ${EndIf}
  ${If} $downloadStatus == "OK"
    DetailPrint "verifying download"
    Call VerifyPayload
  ${EndIf}
!macroend

Section "install kimo"
  ; Includes temporary payload, the unpacked app, and conservative free space.
  AddSize 2000000
  InitPluginsDir
  StrCpy $payload "$PLUGINSDIR\kimo-verified-setup.exe"
  retry:
  DetailPrint "downloading kimo (about 369 MB)"
  !insertmacro Fetch "${PRIMARY_URL}"
  ${If} $digest == ""
    Delete "$payload"
    !if "${PRIMARY_URL}" != "${FALLBACK_URL}"
      DetailPrint "trying the backup download server"
      !insertmacro Fetch "${FALLBACK_URL}"
    !endif
  ${EndIf}
  ${If} $digest == ""
    Delete "$payload"
    ${IfNot} ${Silent}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Could not download and verify kimo ($downloadStatus). Check your connection and try again. Your existing installation has not been changed." IDRETRY retry
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; The only app-changing operation. All failure/cancel paths above leave the
  ; previous installation untouched. /D is the last argument, as NSIS requires.
  DetailPrint "installing kimo"
  StrCpy $installing "1"
  ClearErrors
  ExecWait '"$payload" /S /currentuser /D=$INSTDIR' $installExit
  IfErrors install_failed
  ${If} $installExit != 0
    Goto install_failed
  ${EndIf}
  ${IfNot} ${FileExists} "$INSTDIR\kimo.exe"
    Goto install_failed
  ${EndIf}
  Delete "$payload"
  SetErrorLevel 0
  Goto done
  install_failed:
  Delete "$payload"
  MessageBox MB_OK|MB_ICONEXCLAMATION "kimo could not finish installing (exit $installExit). Please run setup again." /SD IDOK
  SetErrorLevel 3
  Quit
  done:
SectionEnd
