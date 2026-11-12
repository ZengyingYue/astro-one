; Compile against the production directory transaction using a private payload and target.
Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Desktop directory replacement smoke"
OutFile "${OUTPUT_FILE}"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
LangString decompressionFailed ${LANG_ENGLISH} "Payload extraction failed"

!macro installApplicationFiles
  !insertmacro astroOneExtractPayload "${PAYLOAD_FILE}"
!macroend
!ifdef SOURCE_DLL
  LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"
  !include "..\..\installer\strings.nsh"
  !define ASTRO_ONE_INSTALLER_LOG_DIR "${REPORT_DIR}"
  !include "..\..\scripts\installer.nsh"
!else
  !include "..\..\scripts\installer-directories.nsh"
!endif

Section
  InitPluginsDir
  FileOpen $0 "${TARGET_DIR}.plugin-dir.tmp" w
  FileWriteUTF16LE /BOM $0 "$PLUGINSDIR"
  FileClose $0
  Rename "${TARGET_DIR}.plugin-dir.tmp" "${TARGET_DIR}.plugin-dir"
  !ifdef SOURCE_DLL
    File "/oname=$PLUGINSDIR\window-frame.dll" "${SOURCE_DLL}"
  !endif
  StrCpy $INSTDIR "${TARGET_DIR}"
  !insertmacro astroOneStageApplication
  !ifdef RESTORE_CONFLICT
    Rename $astroOneFinalDirectory $astroOneOldDirectory
    StrCpy $astroOneOldMoved "1"
    CreateDirectory $astroOneFinalDirectory
    FileOpen $0 "$astroOneFinalDirectory\unrelated.txt" w
    FileWrite $0 "unrelated file"
    FileClose $0
    StrCpy $astroOneDirectorySource $astroOneNewDirectory
    StrCpy $astroOneDirectoryDestination $astroOneFinalDirectory
    !insertmacro astroOneDirectoryOperation "$astroOneDirectorySource" "$astroOneDirectoryDestination" $astroOneDirectoryError "promote"
    Call astroOneRollbackDirectories
    !insertmacro astroOneReportDirectoryFailure
    Rename $astroOneFinalDirectory "${TARGET_DIR}.conflict"
    Call astroOneCleanupDirectories
    SetErrorLevel 2
    Quit
  !endif
  !ifdef CANCELLED
    SetErrorLevel 2
    Call astroOneCleanupDirectories
    Quit
  !endif
  !ifdef MISSING_STAGE
    ; A missing source makes the second rename fail after the old directory moved.
    RMDir /r "\\?\$astroOneNewDirectory"
  !endif
  !ifdef LOCKED_STAGE
    System::Call 'kernel32::CreateFileW(w "$astroOneNewDirectory\asset.txt", i 0x80000000, i 1, p 0, i 3, i 0, p 0) p.r9'
  !endif
  Call astroOnePromoteDirectories
  IfErrors failed
  !insertmacro astroOneFinishDirectories
  SetErrorLevel 0
  Quit
  failed:
  !ifdef LOCKED_STAGE
    System::Call 'kernel32::CloseHandle(p r9)'
    Call astroOneCleanupDirectories
  !endif
  SetErrorLevel 2
  Quit
SectionEnd
