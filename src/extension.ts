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

	context.subscriptions.push(disposable);
	context.subscriptions.push(statusBarCommand);
	context.subscriptions.push(statusBarItem);
}

// This method is called when your extension is deactivated
export function deactivate() {}
