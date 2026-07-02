; ARM64 architecture detection for NSIS installer
; Prevents installation on non-ARM64 systems

!include "x64.nsh"

!ifndef DEEPORGANISER_APP_PROCESS_CHECK_DEFINED
!define DEEPORGANISER_APP_PROCESS_CHECK_DEFINED
!define DEEPORGANISER_APP_EXECUTABLE_FILENAME "DeepOrganiser.exe"
!define DEEPORGANISER_PROCESS_CHECK_LOG "deeporganiser-installer-process-check.log"

!ifndef BUILD_UNINSTALLER
  Var /GLOBAL DeepOrganiserUninstallHadErrors
  Var /GLOBAL DeepOrganiserUninstallLogResult
!endif

!macro DEEPORGANISER_LOG_UNINSTALLER_REPAIR _PHASE
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${DEEPORGANISER_PROCESS_CHECK_LOG}'; \
    $$path = '$INSTDIR\${UNINSTALL_FILENAME}'; \
    $$item = Get-Item -LiteralPath $$path -ErrorAction SilentlyContinue; \
    $$version = if ($$item) { $$item.VersionInfo.ProductVersion } else { '' }; \
    $$length = if ($$item) { $$item.Length } else { '' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] uninstaller-repair phase=${_PHASE} instDir=$INSTDIR path=' + $$path + ' exists=' + [bool]$$item + ' version=' + $$version + ' length=' + $$length) \
  }"`
  Pop $DeepOrganiserRepairLogResult
!macroend

!macro DEEPORGANISER_REPAIR_INSTALLED_UNINSTALLER
  Var /GLOBAL DeepOrganiserInstalledUninstaller
  Var /GLOBAL DeepOrganiserBundledUninstaller
  Var /GLOBAL DeepOrganiserRepairLogResult

  !insertmacro DEEPORGANISER_LOG_UNINSTALLER_REPAIR "before"
  StrCpy $DeepOrganiserInstalledUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"

  ${If} ${FileExists} "$DeepOrganiserInstalledUninstaller"
    InitPluginsDir
    StrCpy $DeepOrganiserBundledUninstaller "$PLUGINSDIR\DeepOrganiser-fixed-uninstaller.exe"
    SetOverwrite on
    File "/oname=$PLUGINSDIR\DeepOrganiser-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"

    ClearErrors
    CopyFiles /SILENT "$DeepOrganiserBundledUninstaller" "$DeepOrganiserInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro DEEPORGANISER_LOG_UNINSTALLER_REPAIR "copy-failed"
    ${Else}
      !insertmacro DEEPORGANISER_LOG_UNINSTALLER_REPAIR "after-copy"
    ${EndIf}
  ${Else}
    !insertmacro DEEPORGANISER_LOG_UNINSTALLER_REPAIR "missing"
  ${EndIf}
!macroend

!macro DEEPORGANISER_LOG_UNINSTALL_RESULT _ROOT_KEY _HAD_ERRORS
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${DEEPORGANISER_PROCESS_CHECK_LOG}'; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] uninstall-result root=${_ROOT_KEY} launchErrors=${_HAD_ERRORS} exitCode=$R0 instDir=$INSTDIR') \
  }"`
  Pop $DeepOrganiserUninstallLogResult
!macroend

!macro DEEPORGANISER_LOG_EVENT _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${DEEPORGANISER_PROCESS_CHECK_LOG}'; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] ${_MESSAGE}') \
  }"`
  Pop $9
  Pop $9
!macroend

!macro DEEPORGANISER_LOG_ATOMIC_REMOVE_FAILURE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${DEEPORGANISER_PROCESS_CHECK_LOG}'; \
    $$failed = '$R0'; \
    $$instDir = '$INSTDIR'; \
    $$oldInstallDir = '$PLUGINSDIR\old-install'; \
    $$relative = $$failed; \
    if ($$failed.StartsWith($$instDir, [System.StringComparison]::CurrentCultureIgnoreCase)) { $$relative = $$failed.Substring($$instDir.Length).TrimStart('\') }; \
    $$tempCandidate = if ($$relative -and $$relative -ne $$failed) { Join-Path $$oldInstallDir $$relative } else { '' }; \
    $$kind = if ($$tempCandidate.Length -ge 260) { 'likely-long-path' } else { 'unknown' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] remove-atomic-failed kind=' + $$kind + ' pathLength=' + $$failed.Length + ' tempCandidateLength=' + $$tempCandidate.Length + ' path=' + $$failed + ' tempCandidate=' + $$tempCandidate) \
  }"`
  Pop $9
  Pop $9
!macroend

!macro DEEPORGANISER_FIND_APP_PROCESS _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${DEEPORGANISER_PROCESS_CHECK_LOG}'; \
    $$instDir = '$INSTDIR'; \
    $$target = [System.IO.Path]::GetFullPath((Join-Path $$instDir '${DEEPORGANISER_APP_EXECUTABLE_FILENAME}')); \
    $$psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ProcessId -eq $$PID })[0]; \
    $$installerPid = $$psProc.ParentProcessId; \
    $$hits = @(Get-CimInstance -ClassName Win32_Process | Where-Object { \
      $$path = $$_.ExecutablePath; \
      $$cmd = $$_.CommandLine; \
      if (-not $$path) { $$path = $$_.Path } \
      $$_.ProcessId -ne $$installerPid -and \
      $$_.Name -ieq '${DEEPORGANISER_APP_EXECUTABLE_FILENAME}' -and \
      $$path -and \
      $$cmd -notmatch '--type=' -and \
      [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
    }); \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] find instDir=' + $$instDir + ' target=' + $$target + ' installerPid=' + $$installerPid + ' hits=' + $$hits.Count); \
    if ($$hits.Count -gt 0) { $$hits | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress | Add-Content -LiteralPath $$log -Encoding UTF8; exit 0 } \
    exit 1 \
  }"`
  Pop ${_RETURN}
!macroend

!macro DEEPORGANISER_STOP_APP_PROCESSES
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = Join-Path $$env:TEMP '${DEEPORGANISER_PROCESS_CHECK_LOG}'; \
    $$instDir = '$INSTDIR'; \
    $$target = [System.IO.Path]::GetFullPath((Join-Path $$instDir '${DEEPORGANISER_APP_EXECUTABLE_FILENAME}')); \
    $$psProc = @(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ProcessId -eq $$PID })[0]; \
    $$installerPid = $$psProc.ParentProcessId; \
    $$all = @(Get-CimInstance -ClassName Win32_Process); \
    $$main = @($$all | Where-Object { \
      $$path = $$_.ExecutablePath; \
      $$cmd = $$_.CommandLine; \
      if (-not $$path) { $$path = $$_.Path } \
      $$_.ProcessId -ne $$installerPid -and \
      $$_.Name -ieq '${DEEPORGANISER_APP_EXECUTABLE_FILENAME}' -and \
      $$path -and \
      $$cmd -notmatch '--type=' -and \
      [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
    }); \
    $$ids = @($$main | ForEach-Object { [int]$$_.ProcessId }); \
    $$frontier = @($$ids); \
    while ($$frontier.Count -gt 0) { \
      $$children = @($$all | Where-Object { $$frontier -contains [int]$$_.ParentProcessId -and [int]$$_.ProcessId -ne [int]$$installerPid }); \
      $$childIds = @($$children | ForEach-Object { [int]$$_.ProcessId }); \
      $$ids = @($$ids + $$childIds | Select-Object -Unique); \
      $$frontier = $$childIds; \
    } \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ('[' + (Get-Date -Format o) + '] stop target=' + $$target + ' installerPid=' + $$installerPid + ' ids=' + ($$ids -join ',')); \
    foreach ($$id in ($$ids | Sort-Object -Descending)) { Stop-Process -Id $$id -Force -ErrorAction SilentlyContinue } \
    exit 0 \
  }"`
  Pop $DeepOrganiserStopResult
!macroend

!macro customCheckAppRunning
  Var /GLOBAL DeepOrganiserCheckResult
  Var /GLOBAL DeepOrganiserCloseRetries
  Var /GLOBAL DeepOrganiserStopResult

  !insertmacro DEEPORGANISER_FIND_APP_PROCESS $DeepOrganiserCheckResult
  ${If} $DeepOrganiserCheckResult == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK deeporganiser_do_stop_process
    Quit

    deeporganiser_do_stop_process:
      DetailPrint "$(appClosing)"
      !insertmacro DEEPORGANISER_STOP_APP_PROCESSES
      StrCpy $DeepOrganiserCloseRetries 0

    deeporganiser_wait_for_close:
      Sleep 1000
      !insertmacro DEEPORGANISER_FIND_APP_PROCESS $DeepOrganiserCheckResult
      ${If} $DeepOrganiserCheckResult == 0
        IntOp $DeepOrganiserCloseRetries $DeepOrganiserCloseRetries + 1
        ${If} $DeepOrganiserCloseRetries > 10
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY deeporganiser_wait_for_close
          Quit
        ${Else}
          !insertmacro DEEPORGANISER_STOP_APP_PROCESSES
          Goto deeporganiser_wait_for_close
        ${EndIf}
      ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro DEEPORGANISER_REPAIR_INSTALLED_UNINSTALLER
!macroend

!macro DEEPORGANISER_VERIFY_REQUIRED_FILE _PATH _LABEL
  ${IfNot} ${FileExists} "${_PATH}"
    !insertmacro DEEPORGANISER_LOG_EVENT "verify-required-file missing label=${_LABEL} path=${_PATH}"
    MessageBox MB_OK|MB_ICONSTOP \
      "DeepOrganiser installation is incomplete.$\n$\n\
      Missing required file: ${_LABEL}$\n\
      Path: ${_PATH}$\n$\n\
      Please reinstall DeepOrganiser or download a newer installer." \
      /SD IDOK
    SetErrorLevel 3
    Quit
  ${Else}
    !insertmacro DEEPORGANISER_LOG_EVENT "verify-required-file ok label=${_LABEL} path=${_PATH}"
  ${EndIf}
!macroend

!macro DEEPORGANISER_VERIFY_ARM64_INSTALL
  !insertmacro DEEPORGANISER_LOG_EVENT "verify-install start instDir=$INSTDIR"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\DeepOrganiser.exe" "DeepOrganiser.exe"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\ffmpeg.dll" "ffmpeg.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\libEGL.dll" "libEGL.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\libGLESv2.dll" "libGLESv2.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\d3dcompiler_47.dll" "d3dcompiler_47.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\dxcompiler.dll" "dxcompiler.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\dxil.dll" "dxil.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\vk_swiftshader.dll" "vk_swiftshader.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\vulkan-1.dll" "vulkan-1.dll"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\resources\app.asar" "resources\app.asar"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\resources\bundled-deeporganiser-core\win32-arm64\deeporganiser-core.exe" "deeporganiser-core.exe"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\resources\bundled-deeporganiser-core\win32-arm64\managed-resources\node\node-v24.11.0-win-arm64\node.exe" "node.exe"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\resources\bundled-deeporganiser-core\win32-arm64\managed-resources\acp\codex-acp\0.16.0\win32-arm64\node_modules\@zed-industries\codex-acp-win32-arm64\bin\codex-acp.exe" "codex-acp.exe"
  !insertmacro DEEPORGANISER_VERIFY_REQUIRED_FILE "$INSTDIR\resources\bundled-deeporganiser-core\win32-arm64\managed-resources\acp\claude-agent-acp\0.39.0\win32-arm64\node_modules\@anthropic-ai\claude-agent-sdk-win32-arm64\claude.exe" "claude.exe"
  !insertmacro DEEPORGANISER_LOG_EVENT "verify-install ok instDir=$INSTDIR"
!macroend

!macro customInstall
  !insertmacro DEEPORGANISER_VERIFY_ARM64_INSTALL
!macroend

!macro DEEPORGANISER_HANDLE_UNINSTALL_RESULT _ROOT_KEY
  ${If} ${Errors}
    StrCpy $DeepOrganiserUninstallHadErrors "1"
  ${Else}
    StrCpy $DeepOrganiserUninstallHadErrors "0"
  ${EndIf}

  !insertmacro DEEPORGANISER_LOG_UNINSTALL_RESULT "${_ROOT_KEY}" "$DeepOrganiserUninstallHadErrors"

  ${If} $DeepOrganiserUninstallHadErrors == "1"
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
  ${EndIf}

  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro DEEPORGANISER_HANDLE_UNINSTALL_RESULT "SHELL_CONTEXT"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro DEEPORGANISER_HANDLE_UNINSTALL_RESULT "HKEY_CURRENT_USER"
!macroend

!macro customUnInit
  !insertmacro DEEPORGANISER_LOG_EVENT "uninit instDir=$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro DEEPORGANISER_LOG_EVENT "uninstall-section start instDir=$INSTDIR"
!macroend

!macro customRemoveFiles
  !insertmacro DEEPORGANISER_LOG_EVENT "remove-start instDir=$INSTDIR"

  ${if} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"

    Push ""
    Call un.atomicRMDir
    Pop $R0
    !insertmacro DEEPORGANISER_LOG_EVENT "remove-atomic result=$R0"

    ${if} $R0 != 0
      DetailPrint "Atomic update cleanup failed; falling back to recursive removal: $R0"
      !insertmacro DEEPORGANISER_LOG_ATOMIC_REMOVE_FAILURE

      Push ""
      Call un.restoreFiles
      Pop $R0
      !insertmacro DEEPORGANISER_LOG_EVENT "remove-restore result=$R0"
    ${endif}
  ${endif}

  SetOutPath $TEMP
  ClearErrors
  RMDir /r "$INSTDIR"
  ${if} ${Errors}
    !insertmacro DEEPORGANISER_LOG_EVENT "remove-rmdir errors=1 instDir=$INSTDIR"
    ClearErrors
  ${else}
    !insertmacro DEEPORGANISER_LOG_EVENT "remove-rmdir errors=0 instDir=$INSTDIR"
  ${endif}
!macroend
!endif

; Check architecture when installer validates install directory
; This is called early in the installer lifecycle and won't conflict with electron-builder
Function .onVerifyInstDir
  ; Block installation on non-ARM64 systems
  ${IfNot} ${IsNativeARM64}
    ; System is not ARM64
    MessageBox MB_OK|MB_ICONSTOP \
      "Installation package architecture mismatch$\n$\n\
      This DeepOrganiser installer is designed for ARM64 architecture.$\n$\n\
      Your system does not support ARM64. Please download the appropriate version for your architecture.$\n$\n\
      Download: https://github.com/ResearAI/DeepOrganiser/releases"
    Quit
  ${EndIf}
FunctionEnd
