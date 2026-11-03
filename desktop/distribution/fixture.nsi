; Hosted test payload: tiny native installer, never published.
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${FIXTURE_EXE}"
InstallDir "$TEMP\kimo-distribution-fixture"
!include "StdUtils.nsh"
Function .onInit
  ; Match the frozen electron-builder installer's directory-argument parser.
  ${StdUtils.GetParameter} $0 "D" ""
  StrCmp $0 "" +2
  StrCpy $INSTDIR $0
FunctionEnd
Section
  ReadEnvStr $0 KIMO_FIXTURE_FAIL
  StrCmp $0 "1" fail
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\kimo.exe" w
  FileWrite $0 "fixture installed by verified payload"
  FileClose $0
  SetErrorLevel 0
  Goto done
  fail:
  SetErrorLevel 17
  done:
SectionEnd
