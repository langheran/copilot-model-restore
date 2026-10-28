
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

let watcher;

const HOOK_INSTALLED_KEY = 'agentStopHookInstalled';

// Directory where the hook drops a signal file. Every VS Code window watches
// this directory, so all of them react to the same event simultaneously.
// File-based signaling avoids all networking issues (multicast, ports,
// interfaces) that break when the hook runs in a separate Copilot process.
const SIGNAL_DIR = path.join(
  process.env.COPILOT_HOME || os.homedir(),
  '.copilot',
  'hooks'
);
const SIGNAL_PREFIX = 'agentstop-';
const SIGNAL_EXT = '.signal';

// How long to keep a signal file before deleting it. Gives every window time
// to detect and process the event before the file is removed.
const SIGNAL_CLEANUP_DELAY_MS = 5000;

/**
 * Schedule deletion of a signal file after the cleanup delay. Every window
 * schedules its own deletion; the first timer to fire removes the file and the
 * rest fail silently because it is already gone.
 */
function scheduleSignalCleanup(signalPath) {
  setTimeout(() => {
    try {
      if (fs.existsSync(signalPath)) {
        fs.unlinkSync(signalPath);
      }
    } catch (err) {
      // Best-effort cleanup; ignore failures.
    }
  }, SIGNAL_CLEANUP_DELAY_MS);
}

// The Copilot harness reads user hooks from ~/.copilot/hooks/*.json using the
// GitHub Copilot hook format. The "agentStop" event fires when the main agent
// finishes a turn. We write our hook there.
const HOOK_FILE = path.join(SIGNAL_DIR, 'model-restore-helper.json');

/**
 * Build a PowerShell command that writes a signal file. The filename includes
 * a timestamp generated at runtime, so every hook invocation creates a
 * distinct file that fs.watch can detect.
 */
function buildAgentStopHookCommand() {
  const dir = SIGNAL_DIR.replace(/'/g, "''");
  return (
    "try { " +
    `$d = '${dir}'; ` +
    `$p = Join-Path $d ('${SIGNAL_PREFIX}' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '${SIGNAL_EXT}'); ` +
    "[System.IO.File]::WriteAllText($p, (Get-Date).ToString('o')) } catch {}"
  );
}

/**
 * Write the agentStop hook into ~/.copilot/hooks/model-restore-helper.json
 * (Copilot harness). The hook is written on every activation so it is
 * re-created if a previous window removed it on shutdown.
 */
async function installAgentStopHook(context) {
  const hook = {
    type: 'command',
    powershell: buildAgentStopHookCommand(),
    timeoutSec: 3
  };

  const content = {
    version: 1,
    hooks: {
      agentStop: [hook]
    }
  };

  try {
    fs.mkdirSync(SIGNAL_DIR, { recursive: true });
    fs.writeFileSync(HOOK_FILE, JSON.stringify(content, null, 2) + '\n', 'utf8');
    await context.globalState.update(HOOK_INSTALLED_KEY, true);
  } catch (err) {
    vscode.window.showWarningMessage(
      `Copilot Model Restore no pudo escribir ${HOOK_FILE}: ${err.message}`
    );
  }
}

/**
 * Remove the hook file on shutdown. Because signaling is file-based, removing
 * it only stops future events; it does not affect other running windows. The
 * next window to activate re-creates it.
 */
function uninstallAgentStopHook() {
  try {
    if (fs.existsSync(HOOK_FILE)) {
      fs.unlinkSync(HOOK_FILE);
    }
  } catch (err) {
    // Best-effort cleanup; ignore failures.
  }
}

function getConfig() {
  return vscode.workspace.getConfiguration(
    'copilotModelRestore'
  );
}

function getPreferredModel() {
  return getConfig()
    .get('usualModelLabel', '')
    .trim();
}

async function restoreExtensionModel() {
  const label = getPreferredModel();
  const id = getConfig().get('usualModelId', '').trim();
  const vendor = getConfig().get('usualModelVendor', '').trim();

  if (!label && !id) {
    return false;
  }

  const models = await vscode.lm.selectChatModels();

  const normalize = (s, v) =>
    s
      .replace(new RegExp(`\\s*\\(${v}\\)\\s*$`, 'i'), '')
      .replace(/\s+/g, ' ')
      .trim();

  const targetLabel = normalize(label, vendor);
  const targetId = normalize(id, vendor);

  const model = models.find(m =>
    (m.id === id ||
      m.family === id ||
      m.name === id ||
      normalize(m.name, m.vendor) === targetLabel ||
      normalize(m.id, m.vendor) === targetLabel ||
      normalize(m.name, m.vendor) === targetId ||
      normalize(m.id, m.vendor) === targetId) &&
    (!vendor || m.vendor === vendor)
  );

  if (!model) {
    vscode.window.showWarningMessage(
      `No se encontró el modelo de la extensión "${label || id}" entre los modelos disponibles.`
    );
    return false;
  }

  await vscode.commands.executeCommand(
    'workbench.action.chat.changeModel',
    {
      vendor: model.vendor,
      id: model.id,
      family: model.family
    }
  );

  return true;
}

async function restoreConfiguredDefault() {
  const modelId = vscode.workspace
    .getConfiguration('chat')
    .get('defaultModel', '');

  if (!modelId || modelId === 'auto') {
    vscode.window.showInformationMessage(
      'El modelo predeterminado está vacío o configurado como Auto.'
    );
    return;
  }

  const models = await vscode.lm.selectChatModels();

  const normalize = (s, vendor) =>
    s
  .replace(new RegExp(`\\s*\\(${vendor}\\)\\s*$`, 'i'), '')
  .replace(/\s+/g, ' ')
  .trim();
      // .toLowerCase()

  const target = normalize(modelId, 'openrouter');

  const model = models.find(m =>
  (
    m.id === modelId ||
    m.family === modelId ||
    m.name === modelId ||
    normalize(m.name, m.vendor) === target ||
    normalize(m.id, m.vendor) === target
  ) &&
    m.vendor === 'openrouter'
  );

  if (!model) {
    vscode.window.showWarningMessage(
      `No se encontró el modelo predeterminado "${modelId}" entre los modelos disponibles.`
    );
    return;
  }

  await vscode.commands.executeCommand(
    'workbench.action.chat.changeModel',
    {
      vendor: model.vendor,
      id: model.id,
      family: model.family
    }
  );
}

async function restoreModel() {
  const source = getConfig().get(
    'restoreSource',
    'both'
  );

  if (source === 'extension') {
    await restoreExtensionModel();
    return;
  }

  if (source === 'default') {
    await restoreConfiguredDefault();
    return;
  }

  // 'both': try the extension model first, fall back to the default.
  const restored = await restoreExtensionModel();
  if (!restored) {
    await restoreConfiguredDefault();
  }
}

function activate(context) {
  // Write our agentStop hook into ~/.copilot/hooks/ (Copilot harness).
  installAgentStopHook(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'copilotModelRestore.restore',
      restoreModel
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'copilotModelRestore.openPicker',
      async () => {
        await vscode.commands.executeCommand(
          'workbench.action.chat.openModelPicker'
        );
      }
    )
  );

  // Watch the signal directory so this window reacts to every agentStop event.
  // All windows watch the same directory, so each one reacts simultaneously.
  // File-based signaling avoids all networking issues (multicast, ports,
  // interfaces) that break when the hook runs in a separate Copilot process.
  fs.mkdirSync(SIGNAL_DIR, { recursive: true });

  let lastSignal = 0;

  function handleSignal() {
    // Always restore the model when the agent finishes a turn. The
    // notification is optional and controlled separately below.
    const model = getPreferredModel();

    if (model) {
      restoreModel();
    }

    if (!getConfig().get('showNotificationOnAgentStop', true)) {
      return;
    }

    const message = model
      ? `Copilot finished. If you used another model, return to "${model}".`
      : 'Copilot finished. Configure your preferred model in Settings.';

    const actions = model
      ? ['Open Model Picker', 'Dismiss']
      : ['Open Settings', 'Dismiss'];

    vscode.window.showInformationMessage(
      message,
      ...actions
    ).then(async choice => {
      if (choice === 'Open Model Picker') {
        await vscode.commands.executeCommand(
          'workbench.action.chat.openModelPicker'
        );
      } else if (choice === 'Open Settings') {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'copilotModelRestore.usualModelLabel'
        );
      }
    });
  }

  try {
    watcher = fs.watch(SIGNAL_DIR, (eventType, filename) => {
      if (eventType !== 'rename' && eventType !== 'change') {
        return;
      }
      if (!filename || !filename.startsWith(SIGNAL_PREFIX)) {
        return;
      }
      // Debounce: fs.watch may fire multiple events for one file creation.
      const now = Date.now();
      if (now - lastSignal < 300) {
        return;
      }
      lastSignal = now;
      handleSignal();

      // Schedule deletion of the signal file after a short delay so every
      // window has time to detect and process it before it is removed.
      scheduleSignalCleanup(path.join(SIGNAL_DIR, filename));
    });
  } catch (err) {
    vscode.window.showWarningMessage(
      `Copilot Model Restore could not watch ${SIGNAL_DIR}: ${err.message}`
    );
  }

  // Periodic sweep: delete any signal file older than the cleanup delay, as a
  // safety net in case a window did not schedule its own deletion.
  const cleanupTimer = setInterval(() => {
    try {
      const cutoff = Date.now() - SIGNAL_CLEANUP_DELAY_MS;
      const files = fs.readdirSync(SIGNAL_DIR);
      for (const f of files) {
        if (!f.startsWith(SIGNAL_PREFIX)) {
          continue;
        }
        const p = path.join(SIGNAL_DIR, f);
        const stat = fs.statSync(p);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(p);
        }
      }
    } catch (err) {
      // Best-effort cleanup; ignore failures.
    }
  }, SIGNAL_CLEANUP_DELAY_MS);

  context.subscriptions.push({
    dispose: () => {
      if (watcher) {
        watcher.close();
        watcher = undefined;
      }
      clearInterval(cleanupTimer);
    }
  });

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  function updateStatus() {
    const model = getPreferredModel();

    status.text = model
      ? `$(refresh) Return to ${model}`
      : '$(settings-gear) Configure preferred model';

    status.tooltip =
      'Open the Copilot model picker to return to your preferred model';

    status.command = 'copilotModelRestore.restore';
  }

  updateStatus();
  status.show();
  context.subscriptions.push(status);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(
        'copilotModelRestore.usualModelLabel'
      )) {
        updateStatus();
      }
    })
  );

  context.subscriptions.push(
  vscode.commands.registerCommand(
    'copilotModelRestore.listModels',
    async () => {
      const models = await vscode.lm.selectChatModels();

      const lines = models.map(m =>
        `${m.name}\n  vendor: ${m.vendor}\n  id: ${m.id}\n  family: ${m.family}`
      );

      const doc = await vscode.workspace.openTextDocument({
        language: 'plaintext',
        content: lines.join('\n\n') || 'No models returned.'
      });

      await vscode.window.showTextDocument(doc);
    }
  )
);
}

function deactivate() {
  if (watcher) {
    watcher.close();
    watcher = undefined;
  }
  uninstallAgentStopHook();
}

module.exports = {
  activate,
  deactivate
};
