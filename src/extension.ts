import * as vscode from 'vscode';
import { MainViewProvider } from "./views/MainView";
import { isFileGitIgnored } from "./utilities/utils";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Parakeet extension activated');
    const provider = new MainViewProvider(context.extensionUri);

    // Listen for changes to the text document (any text document)
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
        const document = event.document;
        console.log("Document changed:", document.uri.toString());

        // You can access the changes via event.contentChanges
        event.contentChanges.forEach((change) => {
            console.log("Change detected:", change);
        });
    });

    console.log(`workspace: ${vscode.workspace.workspaceFolders?.map((r) => r.name).join(" ")}`);

    // Open files (multiple in split views)
    console.log(`files: ${vscode.window.visibleTextEditors.map((r) => r.document.fileName).join(" ")}`);

    // Listen for changes to the active text editor (currently focused file)
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            const document = editor.document;
            console.log("Active editor changed:", document.uri.toString());
            isFileGitIgnored(document.uri).then((ignored) => {
                console.log(`${document.uri.toString()} ignored: ${ignored}`);
            });
        } else {
            console.log("No active editor");
        }
    });

    // Add to context subscriptions to ensure they are disposed when the extension is deactivated
    context.subscriptions.push(onDidChangeTextDocument, onDidChangeActiveTextEditor);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(MainViewProvider.viewType, provider)
    );

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

	context.subscriptions.push(statusBarCommand);
	context.subscriptions.push(statusBarItem);
}

// This method is called when your extension is deactivated
export function deactivate() {}
