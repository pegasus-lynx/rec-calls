// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// Import our modular components
import { SymbolsTreeDataProvider } from './symbols-provider';
import { MethodCallTreeDataProvider } from './method-call-provider';
import { InternalMethodCallTreeDataProvider } from './internal-method-call-provider';
import { RecallsCommands } from './commands';
import { WorkspaceSymbolCache } from './workspace-symbol-cache';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "recalls" is now active!');

	// Initialize workspace symbol cache
	const symbolCache = WorkspaceSymbolCache.getInstance();
	
	// Start workspace indexing in the background after a delay to allow other extensions to activate
	setTimeout(() => {
		symbolCache.initializeWorkspaceIndex().then(() => {
			console.log('Workspace symbol indexing completed');
			vscode.window.showInformationMessage('Recalls: Workspace symbols indexed for fast loading!');
		}).catch((error) => {
			console.error('Failed to initialize workspace symbol cache:', error);
			vscode.window.showErrorMessage('Recalls: Failed to index workspace symbols. Check output for details.');
		});
	}, 3000); // Wait 3 seconds for other extensions to activate

	// Create and register the symbols tree data provider
	const symbolsProvider = new SymbolsTreeDataProvider();
	const symbolsTreeView = vscode.window.createTreeView('symbols-current-file', {
		treeDataProvider: symbolsProvider,
		showCollapseAll: true
	});

	// Create and register the method call tree data provider
	const methodCallProvider = new MethodCallTreeDataProvider();
	const methodCallTreeView = vscode.window.createTreeView('inspect-methods', {
		treeDataProvider: methodCallProvider,
		showCollapseAll: true
	});

	// Create and register the internal method call tree data provider
	const internalMethodCallProvider = new InternalMethodCallTreeDataProvider();
	const internalMethodCallTreeView = vscode.window.createTreeView('internal-method-calls', {
		treeDataProvider: internalMethodCallProvider,
		showCollapseAll: true
	});

	// Create commands manager and register all commands
	const commands = new RecallsCommands(symbolsProvider, methodCallProvider, internalMethodCallProvider);
	commands.registerAllCommands(context);

	// Register disposables including the symbol cache
	context.subscriptions.push(
		symbolsTreeView,
		methodCallTreeView,
		internalMethodCallTreeView,
		symbolCache
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}