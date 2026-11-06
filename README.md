<div align="center">

<img src="images/icon.png" width="96" alt="Stateful Buttons icon">

# Stateful Buttons

**Status bar buttons that know whether they are ON or OFF.**

Run shell or VS Code commands from the status bar and see live state at a glance.

</div>

---

## Features

- **Live state**: a button can run a check command and show ON or OFF with its own label, tooltip and color.
- **Background run with spinner**: commands run quietly, the button spins while it works, and the result shows in the status bar.
- **No console flashes**: nothing pops up on Windows.
- **Workspace and user buttons merged**: define personal buttons once, project buttons per repo.
- **Add Button wizard**: `Stateful Buttons: Add Button...` from the Command Palette.
- **Light**: state is checked only on click, on window focus and at start (plus an optional interval while focused).

## Configuration

`statefulButtons.buttons` is an array of buttons.

| Field | Description |
| --- | --- |
| `name` | Label (required). Supports `$(icon)` codicons. |
| `tooltip` | Tooltip text. |
| `command` | Shell command run on click. |
| `vscodeCommand` | VS Code command id run on click instead of `command`. |
| `args` | Arguments for `vscodeCommand`. |
| `cwd` | Working directory. Supports `${workspaceFolder}` and `${userHome}`. Default: first workspace folder, else home. |
| `runIn` | `background` (default) or `terminal`. |
| `alignment` | `left` (default) or `right`. |
| `priority` | Status bar priority, default `0`. |
| `color` | Theme color id or `#hex` for the normal look. |
| `state.command` | Shell command whose result decides ON or OFF. |
| `state.match` | Regex tested against trimmed stdout. If set, ON = match; otherwise ON = exit code 0. |
| `state.interval` | Seconds between checks while the window is focused. `0` = only on click, focus and start. |
| `state.on` / `state.off` | `name`, `tooltip`, `color` overrides for each state. |

`statefulButtons.shell` sets the shell used for commands, e.g. `powershell.exe`. Empty uses the Node default (`cmd.exe` on Windows, `/bin/sh` elsewhere).

## Examples

### Docker container toggle

```json
"statefulButtons.buttons": [
  {
    "name": "$(shield) Proxy",
    "tooltip": "Toggle the proxy container",
    "command": "powershell -NoProfile -Command \"if ((docker inspect -f '{{.State.Running}}' my-container) -eq 'true') { docker stop my-container } else { docker start my-container }\"",
    "state": {
      "command": "docker inspect -f {{.State.Running}} my-container",
      "match": "^true$",
      "interval": 30,
      "on":  { "name": "$(shield) Proxy: ON",  "color": "#3fb950" },
      "off": { "name": "$(circle-slash) Proxy: OFF", "color": "disabledForeground" }
    }
  }
]
```

### Run tests in a terminal

```json
"statefulButtons.buttons": [
  {
    "name": "$(beaker) npm test",
    "command": "npm test",
    "runIn": "terminal"
  }
]
```

### Run a VS Code command

```json
"statefulButtons.buttons": [
  {
    "name": "$(refresh) Reload",
    "vscodeCommand": "workbench.action.reloadWindow",
    "alignment": "right"
  }
]
```

## Security

Workspace buttons run commands from the repository, so they are **ignored in Restricted Mode**. Buttons from your user settings keep working.

## Migrating from Action Buttons

| Action Buttons | Stateful Buttons |
| --- | --- |
| `actionButtons.commands[].name` | `name` |
| `actionButtons.commands[].command` | `command` |
| `useVsCodeApi: true` | `vscodeCommand` |
| `singleInstance` | not needed |

## License

MIT
