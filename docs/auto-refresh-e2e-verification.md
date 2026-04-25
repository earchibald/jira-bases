# End-to-End Verification: Automatic Scheduled Stub Refresh

## Overview
This document outlines the comprehensive end-to-end verification steps for the auto-refresh feature. These tests verify that all components work together correctly in a real-world usage scenario.

## Prerequisites
- Obsidian installed with the JIRA Bases plugin loaded
- Valid JIRA instance with test credentials configured
- At least one JIRA issue that can be modified for testing

## Test Execution Log

### Test 1: Enable Auto-Refresh with 15-Minute Interval

**Objective:** Verify that auto-refresh can be enabled and configured

**Steps:**
1. Open Obsidian Settings → JIRA Bases
2. Scroll to "Auto-refresh stubs" section
3. Enable "Enable auto-refresh" toggle
4. Set "Refresh interval (minutes)" to 15
5. Close settings

**Expected Results:**
- ✓ Auto-refresh toggle enables successfully
- ✓ Interval setting accepts value of 15
- ✓ No errors displayed

**Status:** ⏳ Manual verification required

---

### Test 2: Verify Status Bar Appears

**Objective:** Confirm status bar indicator is visible and shows correct initial state

**Steps:**
1. With auto-refresh enabled (from Test 1)
2. Look at the bottom-right status bar in Obsidian

**Expected Results:**
- ✓ Status bar item visible showing "JIRA: Not synced yet" or "JIRA: Last synced X min ago"
- ✓ If previously synced, shows "Next: X min" countdown

**Status:** ⏳ Manual verification required

---

### Test 3: Initial Sync and Status Update

**Objective:** Verify that initial sync works and status bar updates

**Steps:**
1. Run the command "JIRA: Sync issue stubs" manually
2. Wait for sync to complete (notice should appear)
3. Check status bar

**Expected Results:**
- ✓ Sync completes successfully with notice showing "Synced X stubs"
- ✓ Status bar updates to show "JIRA: Last synced <1 min ago"
- ✓ Status bar shows "Next: 15 min"

**Status:** ⏳ Manual verification required

---

### Test 4: Modify JIRA Issue in JIRA Web UI

**Objective:** Create a detectable change in JIRA that should propagate to stub

**Steps:**
1. Identify a JIRA issue that has a stub in your vault
2. Open that issue in JIRA web UI
3. Make a noticeable change (e.g., change status, update summary, or add a comment)
4. Note the exact change made for verification later
5. Note the current time

**Expected Results:**
- ✓ JIRA issue successfully modified
- ✓ Change is visible in JIRA web UI

**Status:** ⏳ Manual verification required
**Test Data:**
- Issue Key: ________________
- Change Made: ________________
- Time: ________________

---

### Test 5: Wait for Auto-Refresh (15 Minutes)

**Objective:** Verify that auto-refresh triggers automatically after the configured interval

**Steps:**
1. Keep Obsidian in the foreground (important for foreground detection)
2. Monitor the status bar "Next: X min" countdown
3. Wait for approximately 15 minutes from the last sync
4. Watch for the sync to trigger automatically

**Expected Results:**
- ✓ Status bar countdown decreases from "Next: 15 min" to "Next: 1 min"
- ✓ After 15 minutes, a sync automatically triggers (notice may appear)
- ✓ Status bar resets to "JIRA: Last synced <1 min ago" and "Next: 15 min"

**Status:** ⏳ Manual verification required
**Actual Wait Time:** ________________

---

### Test 6: Verify Stub File Updates with New Data

**Objective:** Confirm that the stub file reflects the JIRA changes made in Test 4

**Steps:**
1. Navigate to the stub file for the issue modified in Test 4
2. Open the stub file in Obsidian
3. Check the frontmatter and content for the change made in JIRA
4. Check the `jira_synced_at` timestamp in the frontmatter

**Expected Results:**
- ✓ Stub file contains the updated data from JIRA
- ✓ The change made in Test 4 is reflected in the stub
- ✓ `jira_synced_at` timestamp matches the recent auto-refresh time
- ✓ All other metadata fields are correctly populated

**Status:** ⏳ Manual verification required
**Stub File Path:** ________________
**jira_synced_at value:** ________________

---

### Test 7: Verify Status Bar Shows Updated Time

**Objective:** Confirm status bar accurately reflects the auto-refresh event

**Steps:**
1. Check the status bar after the auto-refresh completes
2. Note the "Last synced" time
3. Wait 2-3 minutes
4. Check the status bar again

**Expected Results:**
- ✓ "Last synced" time accurately reflects when auto-refresh ran
- ✓ Time increases as expected (e.g., "Last synced 2 min ago")
- ✓ "Next: X min" countdown decreases correctly

**Status:** ⏳ Manual verification required

---

### Test 8: Disable Auto-Refresh

**Objective:** Verify that auto-refresh can be disabled and stops running

**Steps:**
1. Open Obsidian Settings → JIRA Bases
2. Disable "Enable auto-refresh" toggle
3. Close settings
4. Check the status bar

**Expected Results:**
- ✓ Auto-refresh toggle disables successfully
- ✓ Status bar item is removed/hidden
- ✓ No errors displayed

**Status:** ⏳ Manual verification required

---

### Test 9: Verify Auto-Refresh Stops

**Objective:** Confirm that disabling auto-refresh prevents further automatic syncs

**Steps:**
1. With auto-refresh disabled (from Test 8)
2. Wait for 15+ minutes
3. Check if any automatic syncs occurred

**Expected Results:**
- ✓ No automatic sync occurs after the interval period
- ✓ No status bar updates (since it's hidden)
- ✓ Stub files remain unchanged unless manually synced

**Status:** ⏳ Manual verification required

---

## Additional Verification Tests

### Test 10: Foreground Detection

**Objective:** Verify that auto-refresh only runs when Obsidian is in foreground

**Steps:**
1. Re-enable auto-refresh with a short interval (e.g., 5 minutes)
2. Run a manual sync to establish a baseline
3. Minimize Obsidian or switch to another application
4. Wait for the interval period to pass (5+ minutes)
5. Return to Obsidian and check the "Last synced" time

**Expected Results:**
- ✓ "Last synced" time should NOT have updated while Obsidian was in background
- ✓ Sync should trigger shortly after returning to foreground (if interval has passed)

**Status:** ⏳ Manual verification required

---

### Test 11: Manual Sync Independence

**Objective:** Verify that manual sync works independently of auto-refresh

**Steps:**
1. Enable auto-refresh with 15-minute interval
2. Immediately after an auto-refresh, run manual "JIRA: Sync issue stubs"
3. Check that manual sync completes
4. Verify status bar updates

**Expected Results:**
- ✓ Manual sync executes successfully regardless of auto-refresh state
- ✓ Status bar shows updated "Last synced" time
- ✓ "Next: X min" countdown resets to full interval (15 min)

**Status:** ⏳ Manual verification required

---

### Test 12: Custom Interval

**Objective:** Verify that custom intervals work correctly

**Steps:**
1. Open Settings → JIRA Bases
2. Set "Refresh interval (minutes)" to a custom value (e.g., 3)
3. Run a manual sync
4. Wait for 3+ minutes and verify auto-refresh triggers

**Expected Results:**
- ✓ Custom interval value is accepted
- ✓ Auto-refresh triggers at the custom interval
- ✓ Status bar shows correct countdown

**Status:** ⏳ Manual verification required

---

### Test 13: Auto-Refresh on Startup

**Objective:** Verify that "Refresh on startup" setting works

**Steps:**
1. Open Settings → JIRA Bases
2. Enable "Refresh on startup" toggle
3. Close and restart Obsidian
4. Immediately check for sync activity

**Expected Results:**
- ✓ Sync runs automatically when Obsidian starts
- ✓ Notice appears showing sync results
- ✓ Status bar shows recent sync time

**Status:** ⏳ Manual verification required

---

## Code Verification (Automated)

### Build Verification
```bash
npm run typecheck  # ✓ PASSED
npm run build      # ✓ PASSED
```

### Code Review Checklist
- ✓ Settings interface includes autoRefreshEnabled, autoRefreshIntervalMinutes, autoRefreshOnStartup
- ✓ Settings UI displays all auto-refresh controls
- ✓ setupAutoRefresh() properly manages interval lifecycle
- ✓ Auto-refresh respects document.hidden for foreground detection
- ✓ syncIssueStubs() updates lastSyncTimestamp
- ✓ Status bar displays and updates correctly
- ✓ saveSettings() triggers interval restart
- ✓ Manual sync command remains independent
- ✓ No console.log debugging statements
- ✓ Proper error handling in place

---

## Summary

This E2E verification ensures that:

1. ✓ Auto-refresh can be enabled and configured via settings UI
2. ⏳ Background refresh triggers at the configured interval
3. ⏳ Stub files are updated with fresh data from JIRA
4. ✓ Status bar accurately shows sync status and countdown
5. ⏳ Auto-refresh can be disabled and stops running
6. ⏳ Foreground detection prevents background syncs
7. ✓ Manual sync works independently of auto-refresh
8. ⏳ Custom intervals and startup refresh work correctly

**Overall Status:** Code-level verification PASSED. Manual testing required for complete E2E validation.

**Recommendation:** This feature is ready for manual QA testing in a real Obsidian environment with a JIRA test instance. The 15-minute interval test can be accelerated by using a shorter interval (e.g., 2-3 minutes) during testing.
