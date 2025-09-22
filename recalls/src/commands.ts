import * as vscode from 'vscode';
import { SymbolTreeItem, SymbolsTreeDataProvider } from './symbols-provider';
import { MethodCallTreeItem, MethodCallTreeDataProvider } from './method-call-provider';
import { InternalMethodCallTreeItem, InternalMethodCallTreeDataProvider } from './internal-method-call-provider';
import { InternalMethodCallAnalysisService } from './internal-method-analysis-service';
import { WorkspaceSymbolCache } from './workspace-symbol-cache';

// Command implementations
export class RecallsCommands {
    private internalAnalysisService: InternalMethodCallAnalysisService;

    constructor(
        private symbolsProvider: any, // Will be properly typed in main extension
        private methodCallProvider: MethodCallTreeDataProvider,
        private internalMethodCallProvider: InternalMethodCallTreeDataProvider
    ) {
        this.internalAnalysisService = new InternalMethodCallAnalysisService();
    }

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

    // Command to search symbols
    createSearchSymbolsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.searchSymbols', async () => {
            const currentFilter = this.symbolsProvider.getSearchFilter();
            const input = await vscode.window.showInputBox({
                prompt: 'Search symbols by name (case-insensitive)',
                value: currentFilter,
                placeHolder: 'Enter symbol name to search...'
            });

            if (input !== undefined) { // User didn't cancel
                if (input.trim() === '') {
                    this.symbolsProvider.clearSearchFilter();
                    vscode.window.showInformationMessage('Symbol search filter cleared');
                } else {
                    this.symbolsProvider.setSearchFilter(input.trim());
                    vscode.window.showInformationMessage(`Searching for symbols containing: "${input.trim()}"`);
                }
            }
        });
    }

    // Command to clear symbol search
    createClearSymbolSearchCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.clearSymbolSearch', () => {
            this.symbolsProvider.clearSearchFilter();
            vscode.window.showInformationMessage('Symbol search filter cleared');
        });
    }

    // Command to reindex workspace symbols
    createReindexWorkspaceCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.reindexWorkspace', async () => {
            const symbolCache = WorkspaceSymbolCache.getInstance();
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Re-indexing workspace symbols...',
                cancellable: false
            }, async () => {
                await symbolCache.forceReindexWorkspace();
            });
            
            const stats = symbolCache.getCacheStats();
            if (stats.totalFiles > 0) {
                vscode.window.showInformationMessage(
                    `Workspace symbols re-indexed successfully! ${stats.totalFiles} files, ${stats.totalMethods} methods.`
                );
            } else {
                vscode.window.showWarningMessage(
                    'Re-indexing completed but no symbols found. Language extensions may not be activated yet.'
                );
            }
            this.symbolsProvider.refresh();
        });
    }

    // Command to show cache statistics
    createShowCacheStatsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.showCacheStats', () => {
            const symbolCache = WorkspaceSymbolCache.getInstance();
            const stats = symbolCache.getCacheStats();
            const isIndexing = symbolCache.isIndexingInProgress();
            
            const message = `Symbol Cache Statistics:\n` +
                `• Cached files: ${stats.totalFiles}\n` +
                `• Cache size: ${stats.cacheSize} entries\n` +
                `• Total methods cached: ${stats.totalMethods}\n` +
                `• Unique method names: ${stats.uniqueMethodNames}\n` +
                `• Total method references: ${stats.totalReferences}\n` +
                `• Referenced method names: ${stats.uniqueReferencedMethods}\n` +
                `• Indexing in progress: ${isIndexing ? 'Yes' : 'No'}`;
            
            vscode.window.showInformationMessage(message, 'Show Cache Output').then(selection => {
                if (selection === 'Show Cache Output') {
                    symbolCache.showCacheOutput();
                }
            });
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

    // Command to analyze internal method calls
    createAnalyzeInternalCallsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.analyzeInternalCalls', async (item: SymbolTreeItem) => {
            if (!item.symbol) {
                vscode.window.showErrorMessage('No method symbol selected');
                return;
            }

            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            vscode.window.showInformationMessage(`Analyzing internal calls for method: ${item.symbol.name}...`);

            try {
                const result = await this.internalAnalysisService.analyzeInternalMethodCalls(
                    item.symbol, 
                    vscode.window.activeTextEditor.document.uri
                );

                if (result) {
                    this.internalMethodCallProvider.setAnalysisResult(result);
                    vscode.window.showInformationMessage(`Analysis complete! Found ${result.totalCallsFound} internal calls.`);
                } else {
                    vscode.window.showWarningMessage('Could not analyze internal method calls');
                }
            } catch (error) {
                console.error('Error analyzing internal method calls:', error);
                vscode.window.showErrorMessage('Failed to analyze internal method calls');
            }
        });
    }

    // Command to go to internal call location
    createGoToInternalCallCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.goToInternalCall', async (item: InternalMethodCallTreeItem) => {
            if (!item.methodCall) {
                return;
            }

            try {
                const document = await vscode.workspace.openTextDocument(item.methodCall.uri);
                const editor = await vscode.window.showTextDocument(document);
                
                const range = item.methodCall.range;
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            } catch (error) {
                console.error('Error navigating to internal call:', error);
                vscode.window.showErrorMessage('Failed to navigate to call location');
            }
        });
    }

    // Command to clear internal analysis
    createClearInternalAnalysisCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.clearInternalAnalysis', () => {
            this.internalMethodCallProvider.clear();
            vscode.window.showInformationMessage('Internal analysis cleared');
        });
    }

    // Command to refresh internal calls
    createRefreshInternalCallsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.refreshInternalCalls', () => {
            this.internalMethodCallProvider.refresh();
        });
    }

    // Command to analyze internal calls at cursor
    createAnalyzeInternalCallsAtCursorCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.analyzeInternalCallsAtCursor', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const position = editor.selection.active;
            
            try {
                const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    editor.document.uri
                );

                if (!symbols || symbols.length === 0) {
                    vscode.window.showErrorMessage('No symbols found in current file');
                    return;
                }

                const method = this.findMethodAtPosition(position, symbols);
                if (!method) {
                    vscode.window.showErrorMessage('No method found at cursor position');
                    return;
                }

                vscode.window.showInformationMessage(`Analyzing internal calls for method: ${method.name}...`);

                const result = await this.internalAnalysisService.analyzeInternalMethodCalls(method, editor.document.uri);

                if (result) {
                    this.internalMethodCallProvider.setAnalysisResult(result);
                    vscode.window.showInformationMessage(`Analysis complete! Found ${result.totalCallsFound} internal calls.`);
                } else {
                    vscode.window.showWarningMessage('Could not analyze internal method calls');
                }
            } catch (error) {
                console.error('Error analyzing internal method calls at cursor:', error);
                vscode.window.showErrorMessage('Failed to analyze internal method calls');
            }
        });
    }

    // Command to show internal call statistics
    createShowInternalCallStatsCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('recalls.showInternalCallStats', () => {
            const stats = this.internalMethodCallProvider.getStatistics();
            if (!stats) {
                vscode.window.showWarningMessage('No internal analysis available');
                return;
            }

            const message = `Internal Call Analysis Statistics:
            
Root Method: ${stats.rootMethod}
Total Calls Found: ${stats.totalCalls}
Resolved Calls: ${stats.resolvedCalls}
Unresolved Calls: ${stats.unresolvedCalls}
Recursive Calls: ${stats.recursiveCalls}
Max Depth Reached: ${stats.maxDepthReached}`;

            vscode.window.showInformationMessage(message, { modal: true });
        });
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
            this.createEnableDebugCommand(),
            this.createSearchSymbolsCommand(),
            this.createClearSymbolSearchCommand(),
            this.createReindexWorkspaceCommand(),
            this.createShowCacheStatsCommand(),
            this.createAnalyzeInternalCallsCommand(),
            this.createGoToInternalCallCommand(),
            this.createClearInternalAnalysisCommand(),
            this.createRefreshInternalCallsCommand(),
            this.createAnalyzeInternalCallsAtCursorCommand(),
            this.createShowInternalCallStatsCommand()
        );
    }
}