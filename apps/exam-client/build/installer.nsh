!macro customInstall
  StrCpy $0 "HKCU"
  ${if} $installMode == "all"
    StrCpy $0 "HKLM"
  ${endif}
  StrCpy $1 "Software\SecureExamPlatform\ExamClientProtocolBackup"
  StrCpy $2 "$0\$1"
  ReadRegStr $3 SHELL_CONTEXT "Software\Classes\secure-exam\shell\open\command" ""
  ${if} $3 == `"$appExe" "%1"`
    ClearErrors
    ReadRegDWORD $4 SHELL_CONTEXT "$1" "HadPrevious"
    IfErrors protocol_create_empty_backup
    Goto protocol_install_done

    protocol_create_empty_backup:
      CreateRegKey SHELL_CONTEXT "$1"
      WriteRegDWORD SHELL_CONTEXT "$1" "HadPrevious" 0
      Goto protocol_install_done
  ${else}
    ClearErrors
    ReadRegStr $3 SHELL_CONTEXT "Software\Classes\secure-exam" "URL Protocol"
    IfErrors protocol_no_previous protocol_save_previous

    protocol_save_previous:
      DeleteRegKey SHELL_CONTEXT "$1"
      CreateRegKey SHELL_CONTEXT "$1"
      ExecWait '"$SYSDIR\reg.exe" copy "$0\Software\Classes\secure-exam" "$2\Association" /s /f' $4
      ${if} $4 != 0
        DeleteRegKey SHELL_CONTEXT "$1"
        MessageBox MB_ICONSTOP "Unable to preserve the existing secure-exam protocol registration. Installation has been stopped."
        Abort
      ${endif}
      WriteRegDWORD SHELL_CONTEXT "$1" "HadPrevious" 1
      Goto protocol_install_done

    protocol_no_previous:
      DeleteRegKey SHELL_CONTEXT "$1"
      CreateRegKey SHELL_CONTEXT "$1"
      WriteRegDWORD SHELL_CONTEXT "$1" "HadPrevious" 0

  ${endif}

  protocol_install_done:
  WriteRegStr SHELL_CONTEXT "Software\Classes\secure-exam" "" "URL:Secure Exam Protocol"
  WriteRegStr SHELL_CONTEXT "Software\Classes\secure-exam" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\secure-exam\DefaultIcon" "" `"$appExe",0`
  WriteRegStr SHELL_CONTEXT "Software\Classes\secure-exam\shell\open\command" "" `"$appExe" "%1"`
!macroend

!macro customUnInstall
  StrCpy $R0 "HKCU"
  ${if} $installMode == "all"
    StrCpy $R0 "HKLM"
  ${endif}
  StrCpy $R1 "Software\SecureExamPlatform\ExamClientProtocolBackup"
  StrCpy $R2 "$R0\$R1"
  ReadRegStr $R3 SHELL_CONTEXT "Software\Classes\secure-exam\shell\open\command" ""
  ${if} $R3 == `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"`
    DeleteRegKey SHELL_CONTEXT "Software\Classes\secure-exam"
    ClearErrors
    ReadRegDWORD $R4 SHELL_CONTEXT "$R1" "HadPrevious"
    IfErrors protocol_delete_backup
    ${if} $R4 == 1
      CreateRegKey SHELL_CONTEXT "Software\Classes\secure-exam"
      ExecWait '"$SYSDIR\reg.exe" copy "$R2\Association" "$R0\Software\Classes\secure-exam" /s /f' $R5
      ${if} $R5 != 0
        MessageBox MB_ICONEXCLAMATION "The previous secure-exam protocol registration could not be restored. Its backup was retained in the registry."
        Goto protocol_restore_failed
      ${endif}
    ${endif}
  ${endif}
  protocol_delete_backup:
  DeleteRegKey SHELL_CONTEXT "$R1"
  protocol_restore_failed:
!macroend
