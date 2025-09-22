import * as vscode from 'vscode';
import { SymbolTreeItem } from './symbols-provider';
import { MethodCallTreeItem, MethodCallTreeDataProvider } from './method-call-provider';

// Command implementations
export class RecallsCommands {
    constructor(
        private symbolsProvider: any, // Will be properly typed in main extension
        private methodCallProvider: MethodCallTreeDataProvider
    ) {}

    // Command to refresh symbols manually
    createRefreshSymbolsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.refreshSymbols', () => {
            this.symbolsProvider.refresh();
        });
    }

    // Command to go to symbol location when clicked
    createGoToSymbolCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.goToSymbol', (item: SymbolTreeItem) => {
            if (vscode.window.activeTextEditor && item.symbol) {
                const range = item.symbol.range;
                vscode.window.activeTextEditor.selection = new vscode.Selection(range.start, range.start);
                vscode.window.activeTextEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        });
    }

    // Command to analyze method calls
    createAnalyzeMethodCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.analyzeMethod', async (item: SymbolTreeItem) => {
            if (item && item.symbol && vscode.window.activeTextEditor) {
                const symbol = item.symbol;
                if (symbol.kind === vscode.SymbolKind.Method || 
                    symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Constructor) {
                    await this.methodCallProvider.analyzeMethod(symbol, vscode.window.activeTextEditor.document.uri);
                } else {
                    vscode.window.showWarningMessage('Please select a method, function, or constructor to analyze.');
                }
            }
        });
    }

    // Command to go to method call location
    createGoToMethodCallCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.goToMethodCall', async (item: MethodCallTreeItem) => {
            if (item && item.callInfo) {
                try {
                    const document = await vscode.workspace.openTextDocument(item.callInfo.uri);
                    const editor = await vscode.window.showTextDocument(document);
                    const range = item.callInfo.range;
                    editor.selection = new vscode.Selection(range.start, range.start);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                }
            }
        });
    }

    // Command to set analysis depth
    createSetDepthCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.setAnalysisDepth', async () => {
            const currentDepth = this.methodCallProvider.getMaxDepth();
            const input = await vscode.window.showInputBox({
                prompt: 'Enter the maximum depth for method call analysis (1-10)',
                value: currentDepth.toString(),
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1 || num > 10) {
                        return 'Please enter a number between 1 and 10';
                    }
                    return null;
                }
            });

            if (input) {
                const depth = parseInt(input);
                this.methodCallProvider.setMaxDepth(depth);
                vscode.window.showInformationMessage(`Analysis depth set to ${depth}`);
            }
        });
    }

    // Command to clear method analysis
    createClearAnalysisCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.clearAnalysis', () => {
            this.methodCallProvider.clearAnalysis();
            vscode.window.showInformationMessage('Method call analysis cleared');
        });
    }

    // Command to refresh method calls
    createRefreshMethodCallsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.refreshMethodCalls', () => {
            this.methodCallProvider.refresh();
        });
    }

    // Command to show workspace analysis info
    createShowWorkspaceInfoCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.showWorkspaceInfo', async () => {
            try {
                const stats = await this.methodCallProvider.getAnalysisService().getWorkspaceStats();
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const folderNames = workspaceFolders?.map(folder => folder.name).join(', ') || 'No workspace';
                
                vscode.window.showInformationMessage(
                    `Workspace Analysis Info:\n` +
                    `• Folders: ${folderNames}\n` +
                    `• Total files: ${stats.totalFiles}\n` +
                    `• Supported files: ${stats.supportedFiles}\n` +
                    `• Current depth: ${this.methodCallProvider.getMaxDepth()}`,
                    { modal: false }
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to get workspace info: ${error}`);
            }
        });
    }

    // Command to analyze method from current cursor position
    createAnalyzeMethodAtCursorCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.analyzeMethodAtCursor', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            const position = activeEditor.selection.active;
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                activeEditor.document.uri
            );

            if (!symbols) {
                vscode.window.showWarningMessage('No symbols found in current file');
                return;
            }

            // Find method at cursor position
            const methodAtCursor = this.findMethodAtPosition(position, symbols);
            if (methodAtCursor) {
                await this.methodCallProvider.analyzeMethod(methodAtCursor, activeEditor.document.uri);
            } else {
                vscode.window.showWarningMessage('No method found at cursor position');
            }
        });
    }

    // Command to enable debug output
    createEnableDebugCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.enableDebug', () => {
            const outputChannel = vscode.window.createOutputChannel('Recalls Debug');
            outputChannel.show();
            
            // Redirect console.log to output channel
            const originalLog = console.log;
            console.log = (...args) => {
                outputChannel.appendLine(args.join(' '));
                originalLog(...args);
            };
            
            vscode.window.showInformationMessage('Debug output enabled. Check "Recalls Debug" output channel.');
        });
    }

    // Helper function to find method at position
    private findMethodAtPosition(position: vscode.Position, symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            if ((symbol.kind === vscode.SymbolKind.Method || 
                 symbol.kind === vscode.SymbolKind.Function ||
                 symbol.kind === vscode.SymbolKind.Constructor) &&
                symbol.range.contains(position)) {
                return symbol;
            }

            if (symbol.children && symbol.children.length > 0) {
                const found = this.findMethodAtPosition(position, symbol.children);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    // Register all commands
    registerAllCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            this.createRefreshSymbolsCommand(),
            this.createGoToSymbolCommand(),
            this.createAnalyzeMethodCommand(),
            this.createGoToMethodCallCommand(),
            this.createSetDepthCommand(),
            this.createClearAnalysisCommand(),
            this.createRefreshMethodCallsCommand(),
            this.createShowWorkspaceInfoCommand(),
            this.createAnalyzeMethodAtCursorCommand(),
            this.createEnableDebugCommand()
        );
    }
}