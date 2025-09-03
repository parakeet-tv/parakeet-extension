// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "parakeet-tv" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('parakeet-tv.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello Cursor!');
	});

	// Register the status bar click command
	const statusBarCommand = vscode.commands.registerCommand('parakeet-tv.statusBarClick', () => {
		// Log to console when status bar item is clicked
		console.log('Parakeet status bar item clicked!');
	});

	// Create the status bar item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
	statusBarItem.command = 'parakeet-tv.statusBarClick';
	statusBarItem.text = 'Parakeet';
	statusBarItem.tooltip = 'Click to interact with Parakeet';
	statusBarItem.show();

	// Register the Parakeet.tv webview provider
	const parakeetViewProvider = new ParakeetViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('parakeetView', parakeetViewProvider)
	);

	context.subscriptions.push(disposable);
	context.subscriptions.push(statusBarCommand);
	context.subscriptions.push(statusBarItem);
}

/**
 * Webview provider for the Parakeet.tv sidebar
 */
class ParakeetViewProvider implements vscode.WebviewViewProvider {
	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'startStream':
					const streamKey = message.streamKey;
					if (streamKey && streamKey.trim()) {
						vscode.window.showInformationMessage(`Starting stream with key: ${streamKey}`);
						// Here you can add your streaming logic
						console.log('Starting stream with key:', streamKey);
					} else {
						vscode.window.showWarningMessage('Please enter a valid stream key');
					}
					break;
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Parakeet.tv</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
						padding: 10px;
						margin: 0;
						height: 100vh;
						box-sizing: border-box;
					}
					.container {
						display: flex;
						flex-direction: column;
						gap: 12px;
					}
					.input-group {
						display: flex;
						flex-direction: column;
						gap: 4px;
					}
					label {
						font-weight: 600;
						font-size: 13px;
						color: var(--vscode-input-foreground);
					}
					input[type="text"] {
						width: 100%;
						padding: 6px 8px;
						border: 1px solid var(--vscode-input-border);
						border-radius: 3px;
						background-color: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						font-family: inherit;
						font-size: 13px;
						box-sizing: border-box;
					}
					input[type="text"]:focus {
						outline: none;
						border-color: var(--vscode-focusBorder);
					}
					button {
						width: 100%;
						padding: 8px 12px;
						border: none;
						border-radius: 3px;
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						font-family: inherit;
						font-size: 13px;
						font-weight: 600;
						cursor: pointer;
						transition: background-color 0.1s ease;
					}
					button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
					button:active {
						transform: translateY(1px);
					}
					button:disabled {
						opacity: 0.6;
						cursor: not-allowed;
					}
					.title {
						font-size: 16px;
						font-weight: 600;
						margin: 0 0 8px 0;
						color: var(--vscode-foreground);
					}
				</style>
			</head>
			<body>
				<div class="container">
					<h3 class="title">Parakeet.tv</h3>

					<div class="input-group">
						<label for="streamKey">Stream Key</label>
						<input type="text" id="streamKey" placeholder="Enter your stream key" />
					</div>

					<button id="startStream">Start Stream</button>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const streamKeyInput = document.getElementById('streamKey');
					const startStreamButton = document.getElementById('startStream');

					// Handle start stream button click
					startStreamButton.addEventListener('click', () => {
						const streamKey = streamKeyInput.value.trim();
						vscode.postMessage({
							command: 'startStream',
							streamKey: streamKey
						});
					});

					// Handle Enter key in input field
					streamKeyInput.addEventListener('keypress', (event) => {
						if (event.key === 'Enter') {
							startStreamButton.click();
						}
					});

					// Auto-focus on the input field when the view opens
					streamKeyInput.focus();
				</script>
			</body>
			</html>
		`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
