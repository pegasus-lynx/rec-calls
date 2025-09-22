// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// Import our modular components
import { SymbolsTreeDataProvider } from './symbols-provider';
import { MethodCallTreeDataProvider } from './method-call-provider';
import { RecallsCommands } from './commands';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "recalls" is now active!');

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

	// Create commands manager and register all commands
	const commands = new RecallsCommands(symbolsProvider, methodCallProvider);
	commands.registerAllCommands(context);

	// Register the tree views and hello world command
	context.subscriptions.push(
		symbolsTreeView,
		methodCallTreeView
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}