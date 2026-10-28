
# Copilot Model Restore

A VS Code extension that **automatically restores your preferred GitHub Copilot
Chat model** every time an agent turn finishes. When the main Copilot agent
completes a turn, the extension switches the active model back to your
configured default — so you never get stuck on a model you didn't choose.

## Features

- **Automatic model restore on agent stop.** When a Copilot agent turn
  finishes, the extension immediately switches the active chat model back to
  your configured default. No manual action needed.
- **Restore to the VS Code default model.** By default the extension restores
  the model defined in VS Code's `chat.defaultModel` setting, so whatever
  model you set as your default is the one you always return to.
- **Flexible restore source.** Choose whether to restore the VS Code default
  model, a model configured in this extension, or try the extension model
  first and fall back to the default.
- **Status bar button.** Shows your preferred model and lets you restore it
  manually with one click.
- **Optional notification.** Turn on a reminder notification when an agent
  turn finishes. When disabled, the restore happens silently.

## How it works

The extension installs an `agentStop` hook into `~/.copilot/hooks/`. The
`agentStop` event fires whenever the main Copilot agent finishes a turn. On
that event, the extension calls the documented model-change command to switch
the active chat model back to your configured default — automatically.

## Configure

Open Preferences: Open User Settings (JSON) and add:

```json
{
  "chat.defaultModel": "deepseek/deepseek-v4-flash",
  "copilotModelRestore.restoreSource": "default",
  "copilotModelRestore.showNotificationOnAgentStop": false
}
```

### Restore source

The `copilotModelRestore.restoreSource` setting controls which model is
restored:

| Value       | Behavior                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `default`   | Restores the model set in VS Code's `chat.defaultModel` setting. This is the default. |
| `extension` | Restores the model configured in this extension's own settings (`usualModelLabel` / `usualModelId` / `usualModelVendor`). |
| `both`      | Tries the extension model first; if it is not found, falls back to the default model. |

### Extension model settings

If you use `restoreSource: "extension"` or `"both"`, configure the model this
extension should restore:

```json
{
  "copilotModelRestore.usualModelLabel": "DeepSeek: DeepSeek V4 Flash 0423 (OpenRouter)",
  "copilotModelRestore.usualModelId": "deepseek/deepseek-v4-flash",
  "copilotModelRestore.usualModelVendor": "openrouter"
}
```

### Notification

By default the model is restored silently. To also show a reminder
notification when an agent turn finishes, set:

```json
{
  "copilotModelRestore.showNotificationOnAgentStop": true
}
```

## Test the extension

1. Open this folder in VS Code.
2. Press F5.
3. In the Extension Development Host window, open Copilot Chat.
4. Run "Copilot Model Restore: Return to Preferred Model".
5. Confirm that the active model switches back to your configured default.

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

The extension restores the model using the documented model-change command. It
can only switch to a model that is currently available in your Copilot
installation; if the configured model is not found among the available models,
a warning is shown and no change is made.
