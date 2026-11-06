'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const os = require('os');
const fs = require('fs');

let output;
let buttons = [];
let focused = true;

function log(msg) {
	if (output) output.appendLine(msg);
}

function pad(n) {
	return String(n).padStart(2, '0');
}

function stamp() {
	const d = new Date();
	return '[' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' +
		pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ']';
}

function plainName(name) {
	return String(name).replace(/^\s*\$\([^)]*\)\s*/, '').trim() || String(name);
}

function getButtons() {
	const i = vscode.workspace.getConfiguration('statefulButtons').inspect('buttons') || {};
	const out = [];
	for (const def of (i.globalValue || [])) out.push({ def, source: 'user' });
	if (vscode.workspace.isTrusted) {
		for (const def of (i.workspaceValue || [])) out.push({ def, source: 'workspace' });
		for (const def of (i.workspaceFolderValue || [])) out.push({ def, source: 'workspace' });
	}
	return out.filter(x => x.def && x.def.name);
}

function stopTimers() {
	for (const b of buttons) {
		if (b.timer) { clearInterval(b.timer); b.timer = undefined; }
	}
}

function startTimers() {
	stopTimers();
	for (const b of buttons) {
		const iv = b.def.state && Number(b.def.state.interval);
		if (iv > 0) b.timer = setInterval(() => checkState(b), iv * 1000);
	}
}

function disposeAll() {
	stopTimers();
	for (const b of buttons) b.item.dispose();
	buttons = [];
}

function render() {
	disposeAll();
	getButtons().forEach((entry, index) => {
		const def = entry.def;
		const align = def.alignment === 'right' ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
		const item = vscode.window.createStatusBarItem(align, Number(def.priority) || 0);
		item.command = { command: 'statefulButtons.click', arguments: [index], title: '' };
		const b = { item, def, source: entry.source, running: false, checking: false, on: undefined, timer: undefined };
		buttons.push(b);
		applyLook(b);
		item.show();
	});
	refreshAll();
	if (focused) startTimers();
}

function toColor(c) {
	if (!c) return undefined;
	return String(c).startsWith('#') ? c : new vscode.ThemeColor(c);
}

function applyLook(b) {
	const def = b.def;
	let name = def.name, tooltip = def.tooltip, color = def.color;
	if (def.state) {
		const o = b.on === true ? def.state.on : b.on === false ? def.state.off : undefined;
		if (o) {
			if (o.name) name = o.name;
			if (o.tooltip) tooltip = o.tooltip;
			if (o.color) color = o.color;
		}
	}
	b.item.text = b.running ? '$(sync~spin) ' + plainName(name) : name;
	let tip = tooltip || plainName(def.name);
	if (b.on === true) tip += '\n\nON';
	else if (b.on === false) tip += '\n\nOFF';
	b.item.tooltip = tip;
	b.item.color = toColor(color);
}

function getShell() {
	const s = vscode.workspace.getConfiguration('statefulButtons').get('shell');
	return s ? s : undefined;
}

function exec(cmd, cwd, timeoutMs) {
	return new Promise(resolve => {
		cp.exec(cmd, {
			cwd,
			shell: getShell(),
			windowsHide: true,
			timeout: timeoutMs || 0,
			maxBuffer: 1024 * 1024,
			env: process.env,
		}, (err, stdout, stderr) => {
			const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
			resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') });
		});
	});
}

function resolveCwd(def) {
	const home = os.homedir();
	const folders = vscode.workspace.workspaceFolders;
	const first = folders && folders.length ? folders[0].uri.fsPath : home;
	let cwd = def.cwd
		? String(def.cwd).split('${workspaceFolder}').join(first).split('${userHome}').join(home)
		: first;
	try {
		if (!fs.statSync(cwd).isDirectory()) cwd = home;
	} catch (e) {
		cwd = home;
	}
	return cwd;
}

async function checkState(b) {
	const st = b.def.state;
	if (!st || !st.command || b.checking || b.running) return;
	b.checking = true;
	try {
		const r = await exec(st.command, resolveCwd(b.def), 5000);
		let on;
		if (st.match) {
			try {
				on = new RegExp(st.match).test(r.stdout.trim());
			} catch (e) {
				log(stamp() + ' Bad regex in "' + plainName(b.def.name) + '": ' + e.message);
				on = false;
			}
		} else {
			on = r.code === 0;
		}
		b.on = on;
	} finally {
		b.checking = false;
		applyLook(b);
	}
}

function refreshAll() {
	for (const b of buttons) checkState(b);
}

function lastLine(s) {
	const lines = String(s).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
	return lines.length ? lines[lines.length - 1] : '';
}

function terminalFor(name, cwd) {
	const tname = 'Stateful Buttons: ' + name;
	let t = vscode.window.terminals.find(x => x.name === tname && x.exitStatus === undefined);
	if (!t) t = vscode.window.createTerminal({ name: tname, cwd });
	return t;
}

async function click(index) {
	const b = buttons[index];
	if (!b || b.running) return;
	const def = b.def;
	const name = plainName(def.name);
	if (def.vscodeCommand) {
		try {
			await vscode.commands.executeCommand(def.vscodeCommand, ...(def.args || []));
		} catch (e) {
			vscode.window.showErrorMessage(name + ': ' + e.message);
		}
		await checkState(b);
		return;
	}
	if (!def.command) {
		vscode.window.showWarningMessage('Button "' + name + '" has no "command" or "vscodeCommand". Add one in settings.');
		return;
	}
	const cwd = resolveCwd(def);
	if (def.runIn === 'terminal') {
		const t = terminalFor(name, cwd);
		t.show();
		t.sendText(def.command);
		setTimeout(() => checkState(b), 1500);
		return;
	}
	b.running = true;
	applyLook(b);
	log(stamp() + ' ▶ ' + name + ': ' + def.command);
	const r = await exec(def.command, cwd, 0);
	if (r.stdout) log(r.stdout.trimEnd());
	if (r.stderr) log(r.stderr.trimEnd());
	b.running = false;
	if (r.code === 0) {
		const line = lastLine(r.stdout).slice(0, 80);
		vscode.window.setStatusBarMessage('$(check) ' + name + (line ? ': ' + line : ''), 4000);
	} else {
		const line = lastLine(r.stderr) || lastLine(r.stdout);
		vscode.window.showErrorMessage(
			name + ' failed (exit ' + r.code + ')' + (line ? ': ' + line : ''), 'Show Log'
		).then(p => { if (p === 'Show Log') output.show(true); });
	}
	await checkState(b);
}

async function addButton() {
	const name = await vscode.window.showInputBox({
		prompt: 'Button name (supports $(icon))',
		validateInput: v => (v && v.trim() ? undefined : 'Name is required'),
	});
	if (!name) return;
	const command = await vscode.window.showInputBox({ prompt: 'Shell command to run on click' });
	if (command === undefined) return;
	const mode = await vscode.window.showQuickPick(['Background', 'Terminal'], { placeHolder: 'Run mode' });
	if (!mode) return;
	const stateCmd = await vscode.window.showInputBox({ prompt: 'State command (optional, empty = none)' });
	if (stateCmd === undefined) return;
	let match;
	if (stateCmd.trim()) {
		match = await vscode.window.showInputBox({ prompt: 'Match regex for stdout (optional, empty = exit code 0 means ON)' });
		if (match === undefined) return;
	}
	const targets = ['User settings'];
	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) targets.push('Workspace settings');
	const target = await vscode.window.showQuickPick(targets, { placeHolder: 'Save to' });
	if (!target) return;

	const def = { name: name.trim() };
	if (command.trim()) def.command = command.trim();
	if (mode === 'Terminal') def.runIn = 'terminal';
	if (stateCmd.trim()) {
		def.state = { command: stateCmd.trim() };
		if (match && match.trim()) def.state.match = match.trim();
	}
	const config = vscode.workspace.getConfiguration('statefulButtons');
	const i = config.inspect('buttons') || {};
	const isWs = target === 'Workspace settings';
	const arr = [...((isWs ? i.workspaceValue : i.globalValue) || [])];
	arr.push(def);
	await config.update('buttons', arr, isWs ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage('Button added');
}

function activate(context) {
	output = vscode.window.createOutputChannel('Stateful Buttons');
	context.subscriptions.push(output);
	focused = vscode.window.state.focused;
	render();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('statefulButtons')) render();
		}),
		vscode.window.onDidChangeWindowState(s => {
			focused = s.focused;
			if (focused) { refreshAll(); startTimers(); } else stopTimers();
		}),
		vscode.workspace.onDidGrantWorkspaceTrust(() => render()),
		vscode.commands.registerCommand('statefulButtons.click', click),
		vscode.commands.registerCommand('statefulButtons.addButton', addButton),
		vscode.commands.registerCommand('statefulButtons.editButtons', () =>
			vscode.commands.executeCommand('workbench.action.openSettingsJson')),
		vscode.commands.registerCommand('statefulButtons.refresh', refreshAll),
		vscode.commands.registerCommand('statefulButtons.showLog', () => output.show(true)),
		{ dispose: disposeAll }
	);
}

function deactivate() {
	stopTimers();
}

module.exports = { activate, deactivate };
