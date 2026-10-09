#!/usr/bin/env bash
set -Eeuo pipefail

ARTIFACT_DIR="mobile/artifacts/android-runtime"
mkdir -p "$ARTIFACT_DIR"
LOG_FILE="$ARTIFACT_DIR/runtime.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "AIMPACT_ANDROID_RUNTIME_DIAGNOSTICS=START"
adb wait-for-device
echo "ADB_DEVICE=$(adb get-state)"
timeout 180 bash -c 'until adb shell cmd package list packages >/dev/null 2>&1; do sleep 2; done'
echo "PACKAGE_MANAGER=READY"

APK="mobile/android/app/build/outputs/apk/release/app-release.apk"
test -s "$APK"
adb install -r "$APK"
adb shell am force-stop ai.aimpact.app
adb logcat -c

echo "AIMPACT_LAUNCH_ATTEMPT=1"
set +e
LAUNCH_OUTPUT="$(adb shell am start -W -n ai.aimpact.app/.MainActivity 2>&1)"
LAUNCH_STATUS=$?
set -e
echo "LAUNCH_STATUS=$LAUNCH_STATUS"
printf '%s\n' "$LAUNCH_OUTPUT"
if [ "$LAUNCH_STATUS" -ne 0 ]; then
  adb shell monkey -p ai.aimpact.app 1 || true
fi

sleep 10
PID="$(adb shell pidof ai.aimpact.app 2>/dev/null | tr -d '\r' || true)"
ACTIVITY="$(adb shell dumpsys activity activities 2>/dev/null | grep -E -m1 'mResumedActivity|topResumedActivity|ResumedActivity' | grep -F 'ai.aimpact.app' || true)"
CRASH_LOG="$(adb logcat -b crash -d 2>/dev/null || true)"
printf '%s\n' "$CRASH_LOG" > "$ARTIFACT_DIR/crash-buffer.log"
adb logcat -d > "$ARTIFACT_DIR/logcat-full.log" 2>&1 || true
adb shell dumpsys activity activities > "$ARTIFACT_DIR/activity-state.txt" 2>&1 || true
adb shell dumpsys activity processes > "$ARTIFACT_DIR/process-state.txt" 2>&1 || true
echo "AIMPACT_PID=${PID:-NONE}"
echo "AIMPACT_FOREGROUND_ACTIVITY=${ACTIVITY:-NONE}"
echo "CRASH_BUFFER_LINES=$(printf '%s\n' "$CRASH_LOG" | wc -l | tr -d ' ')"

if [ -z "$PID" ] || printf '%s\n' "$CRASH_LOG" | grep -E 'FATAL EXCEPTION|Fatal signal|Process: ai\.aimpact\.app' >/dev/null; then
  echo "AIMPACT_RUNTIME=FAIL"
  echo "===== APP / CRASH LOGS ====="
  grep -E -i 'AndroidRuntime|FATAL EXCEPTION|Fatal signal|ReactNativeJS|ai\.aimpact\.app|ReactNative|SoLoader' "$ARTIFACT_DIR/logcat-full.log" | tail -n 300 || true
  echo "===== ACTIVITY STATE ====="
  tail -n 150 "$ARTIFACT_DIR/activity-state.txt" || true
  echo "===== PROCESS STATE ====="
  tail -n 150 "$ARTIFACT_DIR/process-state.txt" || true
  exit 1
fi

echo "AIMPACT_RUNTIME=PASS"
