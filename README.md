
# Copilot Model Restore

A VS Code extension that reminds you to return to your preferred
GitHub Copilot Chat model after an agent turn finishes.

## Features

- Configure your preferred model in VS Code Settings.
- Show a status bar button using your configured model name.
- Open the Copilot model picker.
- Receive an optional notification from an agentStop hook.

## Configure

Open Preferences: Open User Settings (JSON) and add:

{
  "copilotModelRestore.usualModelLabel": "GPT-5",
  "copilotModelRestore.showNotificationOnAgentStop": true
}

Replace GPT-5 with the model name you normally use.

The model is always restored when a Copilot agent turn finishes. Set
`showNotificationOnAgentStop` to `true` to also show a reminder notification.

## Test the extension

1. Open this folder in VS Code.
2. Press F5.
3. In the Extension Development Host window, open Copilot Chat.
4. Run "Copilot Model Restore: Return to Preferred Model".
5. Confirm that the model picker opens.

## Optional agentStop hook

On activation, the extension writes an `agentStop` hook into
`~/.copilot/hooks/model-restore-helper.json` (or
`$COPILOT_HOME/hooks/model-restore-helper.json` when `COPILOT_HOME` is set).
The `agentStop` event fires when the main Copilot agent finishes a turn.

The installed hook writes a small signal file into the same directory
(`agentstop-<timestamp>.signal`). Every VS Code window running the extension
watches that directory, so **all windows react to the event at the same time**.

Signal files are deleted automatically about 5 seconds after they are created,
once every window has had time to detect and process the event. A periodic
sweep also removes any stale signal files, so the directory never fills up.

### Multiple VS Code windows

The extension supports running in several VS Code windows at the same time.
Because signaling is file-based, every window reacts simultaneously — there is
no single "owner" window, no network port, and no `EADDRINUSE` conflict. You
can open, close, and reopen windows freely; each one watches the directory on
activation and stops on shutdown.

The hook file is a single shared file. It is written on every activation and
removed when a window closes, so it is always present while at least one
window is running.

If you prefer to configure the hook manually, create the hook configuration
supported by your Copilot installation. For Windows PowerShell:

{
  "version": 1,
  "hooks": {
    "agentStop": [
      {
        "type": "command",
        "powershell": "try { $d = 'C:\\Users\\<you>\\.copilot\\hooks'; $p = Join-Path $d ('agentstop-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '.signal'); [System.IO.File]::WriteAllText($p, (Get-Date).ToString('o')) } catch {}",
        "timeoutSec": 3
      }
    ]
  }
}

Consult:
https://code.visualstudio.com/docs/agent-customization/hooks

## Limitations

The extension uses the documented model-picker command. It does not
automatically select a specific model because a supported public API
for changing the active Copilot Chat model has not been verified.
