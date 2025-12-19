z# Task: Fix Disabled Add Button in Tasks Tabs

## Issue
The add button in tasks tabs was disabled when clients had no dossiers or cases, preventing users from creating tasks.

## Root Cause
The `canAdd` logic in `AggregatedRelatedTab.jsx` only checked for required searchable-select fields with options, but for tasks, the `dossierId` and `caseId` fields are not required (required: false). However, tasks must be linked to either a dossier or case.

## Solution
Modified the `canAdd` logic to include special handling for tasks tabs:
- Check if there are options available for either `dossierId` or `caseId` fields
- Allow adding tasks if at least one of these fields has options

## Files Modified
- `src/components/DetailView/tabs/AggregatedRelatedTab.jsx`: Updated canAdd logic

## Testing
- Verify that add button is enabled in tasks tabs when:
  - Client has dossiers (can create dossier-level tasks)
  - Client has cases (can create case-level tasks)
  - Dossier has cases (can create case-level tasks from dossier view)
- Verify that add button is disabled when no parent entities exist

## Status
✅ Completed - Logic updated to allow task creation when appropriate parent entities exist
