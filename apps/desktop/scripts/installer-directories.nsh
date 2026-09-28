!include "LogicLib.nsh"

Var astroOneFinalDirectory
Var astroOneNewDirectory
Var astroOneOldDirectory
Var astroOneOldMoved
Var astroOneNewMoved

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
    ClearErrors
    Rename $astroOneOldDirectory $astroOneFinalDirectory
    ${If} ${Errors}
      ; Leave the complete backup in place if another process prevents restoration.
      DetailPrint $astroOneOldDirectory
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
    Rename $astroOneFinalDirectory $astroOneOldDirectory
    ${If} ${Errors}
      Call astroOneRollbackDirectories
      SetErrors
      Return
    ${EndIf}
    StrCpy $astroOneOldMoved "1"
  ${Else}
    ; NSIS can create the destination before the install section starts.
    RMDir $astroOneFinalDirectory
  ${EndIf}
  ClearErrors
  Rename $astroOneNewDirectory $astroOneFinalDirectory
  ${If} ${Errors}
    Call astroOneRollbackDirectories
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
