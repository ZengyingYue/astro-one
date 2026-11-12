!include "LogicLib.nsh"

Var astroOneFinalDirectory
Var astroOneNewDirectory
Var astroOneOldDirectory
Var astroOneOldMoved
Var astroOneNewMoved
Var astroOneDirectoryError
Var astroOneDirectorySource
Var astroOneDirectoryDestination
Var astroOneRestoreError
Var astroOneDirectoryLogDirectory
Var astroOneRecoveryStopped

; MoveFileEx preserves the destination and exposes the Windows error before rollback changes it.
; Open files inside a directory can make its rename return access denied (5).
!macro astroOneDirectoryOperation SOURCE DESTINATION RESULT PHASE
  Push $0
  Push $1
  Push $2
  StrCpy $0 0
  ${Do}
    ${If} "${DESTINATION}" == ""
      System::Call 'kernel32::RemoveDirectoryW(w "${SOURCE}") i.r1 ?e'
    ${Else}
      System::Call 'kernel32::MoveFileExW(w "${SOURCE}", w "${DESTINATION}", i 0) i.r1 ?e'
    ${EndIf}
    Pop ${RESULT}
    ${If} "${DESTINATION}" == ""
      ${If} ${RESULT} == 2
      ${OrIf} ${RESULT} == 3
        StrCpy $1 1
      ${EndIf}
    ${EndIf}
    ${If} $1 != 0
      StrCpy ${RESULT} 0
      ${ExitDo}
    ${EndIf}
    ClearErrors
    FileOpen $2 "$PLUGINSDIR\directory-operations.log" a
    ${IfNot} ${Errors}
      FileSeek $2 0 END
      FileWrite $2 "${PHASE}: Windows error: ${RESULT}$\r$\n"
      FileClose $2
    ${EndIf}
    ${If} ${RESULT} != 5
    ${AndIf} ${RESULT} != 32
    ${AndIf} ${RESULT} != 33
      ${ExitDo}
    ${EndIf}
    IntOp $0 $0 + 1
    ${If} $0 >= 10
      ${ExitDo}
    ${EndIf}
    IntOp $1 $0 * 250
    Sleep $1
  ${Loop}
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro astroOneReportDirectoryFailure
  ${If} $astroOneRestoreError != 0
    StrCpy $astroOneRecoveryStopped "1"
  ${EndIf}
  !ifmacrodef customInstallerDirectoryFailed
    !insertmacro customInstallerDirectoryFailed
  !else
    DetailPrint "Directory operation failed ($astroOneDirectoryError): $astroOneDirectorySource -> $astroOneDirectoryDestination; restore error: $astroOneRestoreError"
  !endif
!macroend

!macro astroOneExtractPayload FILE
  !ifmacrodef customInstallerExtract
    !insertmacro customInstallerExtract "${FILE}"
  !else
    nsExec::ExecToStack '"$PLUGINSDIR\astro-one-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
    Pop $R0
    Pop $R1
  !endif
  ${If} $R0 != 0
    DetailPrint $R1
    Call astroOneRollbackDirectories
    !ifmacrodef customInstallerExtractFailed
      !insertmacro customInstallerExtractFailed "${FILE}"
    !else
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    !endif
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro astroOneStageApplication
  !ifdef ASTRO_ONE_INSTALLER_LOG_DIR
    ; electron-builder defines the cache name after including our function bodies, before this section expands.
    StrCpy $astroOneDirectoryLogDirectory "${ASTRO_ONE_INSTALLER_LOG_DIR}"
  !endif
  StrCpy $astroOneFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $astroOneNewDirectory "$INSTDIR.new-$0"
  StrCpy $astroOneOldDirectory "$INSTDIR.old-$0"
  StrCpy $astroOneOldMoved ""
  StrCpy $astroOneNewMoved ""
  StrCpy $astroOneDirectoryError 0
  StrCpy $astroOneRestoreError 0
  StrCpy $astroOneRecoveryStopped ""
  ClearErrors
  CreateDirectory $astroOneNewDirectory
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  File /oname=$PLUGINSDIR\astro-one-7za.exe "${ASTRO_ONE_SEVENZIP_PATH}"
  StrCpy $INSTDIR $astroOneNewDirectory
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  !ifdef ASTRO_ONE_SEVENZIP_LICENSE_DIR
    File /oname=7zip-installer-LICENSE.txt "${ASTRO_ONE_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
    File /oname=7zip-installer-COPYING.txt "${ASTRO_ONE_SEVENZIP_LICENSE_DIR}\COPYING"
  !endif
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  StrCpy $INSTDIR $astroOneFinalDirectory
  SetOutPath $PLUGINSDIR
!macroend

Function .onGUIEnd
  Call astroOneCleanupDirectories
FunctionEnd

Function astroOneCleanupDirectories
  ${If} $astroOneRecoveryStopped == "1"
    Return
  ${EndIf}
  ${If} $astroOneFinalDirectory != ""
    Call astroOneRollbackDirectories
  ${EndIf}
FunctionEnd

; Only directories created or renamed by this installer are removed during rollback.
Function astroOneRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $astroOneNewMoved == "1"
    RMDir /r "\\?\$astroOneFinalDirectory"
    StrCpy $astroOneNewMoved ""
  ${EndIf}
  ${If} $astroOneOldMoved == "1"
    !insertmacro astroOneDirectoryOperation "$astroOneOldDirectory" "$astroOneFinalDirectory" $astroOneRestoreError "restore"
    ${If} $astroOneRestoreError != 0
      ; Leave the complete backup in place if another process prevents restoration.
      DetailPrint $astroOneOldDirectory
      RMDir /r "\\?\$astroOneNewDirectory"
      Return
    ${EndIf}
    StrCpy $astroOneOldMoved ""
  ${EndIf}
  ${If} $astroOneNewDirectory != ""
    RMDir /r "\\?\$astroOneNewDirectory"
  ${EndIf}
  StrCpy $INSTDIR $astroOneFinalDirectory
FunctionEnd

Function astroOnePromoteDirectories
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 2
  !endif
  ; SetOutPath opens a directory handle; release it before either rename.
  SetOutPath $PLUGINSDIR
  ClearErrors
  ${If} ${FileExists} "$astroOneFinalDirectory\*.*"
    StrCpy $astroOneDirectorySource $astroOneFinalDirectory
    StrCpy $astroOneDirectoryDestination $astroOneOldDirectory
    !insertmacro astroOneDirectoryOperation "$astroOneDirectorySource" "$astroOneDirectoryDestination" $astroOneDirectoryError "backup"
    ${If} $astroOneDirectoryError != 0
      Call astroOneRollbackDirectories
      !insertmacro astroOneReportDirectoryFailure
      SetErrors
      Return
    ${EndIf}
    StrCpy $astroOneOldMoved "1"
  ${Else}
    ; NSIS can create the destination before the install section starts.
    StrCpy $astroOneDirectorySource $astroOneFinalDirectory
    StrCpy $astroOneDirectoryDestination ""
    !insertmacro astroOneDirectoryOperation "$astroOneDirectorySource" "" $astroOneDirectoryError "remove-empty"
    ${If} $astroOneDirectoryError != 0
      Call astroOneRollbackDirectories
      !insertmacro astroOneReportDirectoryFailure
      SetErrors
      Return
    ${EndIf}
  ${EndIf}
  ClearErrors
  StrCpy $astroOneDirectorySource $astroOneNewDirectory
  StrCpy $astroOneDirectoryDestination $astroOneFinalDirectory
  !insertmacro astroOneDirectoryOperation "$astroOneDirectorySource" "$astroOneDirectoryDestination" $astroOneDirectoryError "promote"
  ${If} $astroOneDirectoryError != 0
    Call astroOneRollbackDirectories
    !insertmacro astroOneReportDirectoryFailure
    SetErrors
    Return
  ${EndIf}
  StrCpy $astroOneNewMoved "1"
  SetOutPath $astroOneFinalDirectory
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 3
  !endif
  ClearErrors
FunctionEnd

!macro astroOneFinishDirectories
  StrCpy $astroOneNewMoved ""
  ${If} $astroOneOldMoved == "1"
    RMDir /r "\\?\$astroOneOldDirectory"
    StrCpy $astroOneOldMoved ""
  ${EndIf}
!macroend
