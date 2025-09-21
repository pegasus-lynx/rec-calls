// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// Interface for method call information
interface MethodCallInfo {
    methodName: string;
    uri: vscode.Uri;
    range: vscode.Range;
    callerMethodName?: string;
    depth: number;
    children: MethodCallInfo[];
}

// Method Call Tree Item class
class MethodCallTreeItem extends vscode.TreeItem {
    constructor(
        public readonly callInfo: MethodCallInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(callInfo.methodName, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'method-call';
        
        // Make the item clickable to navigate to the call location
        this.command = {
            command: 'recalls.goToMethodCall',
            title: 'Go to Method Call',
            arguments: [this]
        };
    }

    private getTooltip(): string {
        const fileName = this.getRelativeFilePath();
        const line = this.callInfo.range.start.line + 1;
        return `${this.callInfo.methodName} in ${fileName}:${line}${this.callInfo.callerMethodName ? ` (called by ${this.callInfo.callerMethodName})` : ''}\nClick to navigate to this call`;
    }

    private getDescription(): string {
        const fileName = this.getRelativeFilePath();
        const line = this.callInfo.range.start.line + 1;
        return `${fileName}:${line}`;
    }

    private getRelativeFilePath(): string {
        // Get relative path from workspace root
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.callInfo.uri);
        if (workspaceFolder) {
            const relativePath = vscode.workspace.asRelativePath(this.callInfo.uri, false);
            return relativePath;
        }
        // Fallback to just filename
        return this.callInfo.uri.fsPath.split('\\').pop() || this.callInfo.uri.fsPath.split('/').pop() || 'unknown';
    }

    private getIcon(): vscode.ThemeIcon {
        if (this.callInfo.depth === 0) {
            return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
        } else {
            return new vscode.ThemeIcon('call-outgoing', new vscode.ThemeColor('symbolIcon.functionForeground'));
        }
    }
}

// Method Call Analysis Service
class MethodCallAnalysisService {
    private maxDepth: number = 3;
    private processedMethods: Set<string> = new Set(); // Track processed methods to avoid infinite recursion

    setMaxDepth(depth: number): void {
        this.maxDepth = Math.max(1, Math.min(depth, 10)); // Limit between 1 and 10
    }

    getMaxDepth(): number {
        return this.maxDepth;
    }

    async analyzeMethodCalls(methodSymbol: vscode.DocumentSymbol, uri: vscode.Uri): Promise<MethodCallInfo | null> {
        try {
            // Clear processed methods for new analysis
            this.processedMethods.clear();
            
            // Create the root method call info
            const rootCallInfo: MethodCallInfo = {
                methodName: methodSymbol.name,
                uri: uri,
                range: methodSymbol.selectionRange,
                depth: 0,
                children: []
            };

            // Find all references to this method across the workspace
            await this.findMethodReferencesWorkspace(rootCallInfo, 0);
            
            return rootCallInfo;
        } catch (error) {
            console.error('Error analyzing method calls:', error);
            return null;
        }
    }

    private async findMethodReferencesWorkspace(callInfo: MethodCallInfo, currentDepth: number): Promise<void> {
        if (currentDepth >= this.maxDepth) {
            return;
        }

        // Create a unique key for this method to avoid infinite recursion
        const methodKey = `${callInfo.uri.toString()}:${callInfo.range.start.line}:${callInfo.range.start.character}:${callInfo.methodName}`;
        if (this.processedMethods.has(methodKey)) {
            return;
        }
        this.processedMethods.add(methodKey);

        try {
            // Use multiple strategies to find references
            let references: vscode.Location[] = [];
            
            // Strategy 1: Use VS Code's built-in reference provider
            try {
                const refs1 = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeReferenceProvider',
                    callInfo.uri,
                    callInfo.range.start
                );
                if (refs1) {
                    references = refs1;
                }
            } catch (error) {
                console.warn('Reference provider failed:', error);
            }

            // Strategy 2: If no references found, try workspace search
            if (references.length === 0) {
                console.log(`No references found via provider for ${callInfo.methodName}, trying workspace search...`);
                references = await this.searchWorkspaceForMethod(callInfo.methodName);
            }

            console.log(`Found ${references.length} references for ${callInfo.methodName}`);

            if (references.length === 0) {
                return;
            }

            // Process references across all files in the workspace
            const callsByFile = new Map<string, vscode.Location[]>();
            references.forEach(ref => {
                const fileKey = ref.uri.toString();
                if (!callsByFile.has(fileKey)) {
                    callsByFile.set(fileKey, []);
                }
                callsByFile.get(fileKey)!.push(ref);
            });

            console.log(`Processing references across ${callsByFile.size} files`);

            // Analyze each file's references
            for (const [fileUri, locations] of callsByFile) {
                const uri = vscode.Uri.parse(fileUri);
                
                // Filter out the original definition
                const filteredLocations = locations.filter(loc => {
                    // Skip if it's the same location as the method definition
                    const isSameLocation = uri.toString() === callInfo.uri.toString() && 
                                         loc.range.isEqual(callInfo.range);
                    const isDefinitionRange = uri.toString() === callInfo.uri.toString() && 
                                            (loc.range.contains(callInfo.range) || callInfo.range.contains(loc.range));
                    return !isSameLocation && !isDefinitionRange;
                });

                if (filteredLocations.length === 0) {
                    continue;
                }

                console.log(`Processing ${filteredLocations.length} references in ${uri.fsPath}`);

                // Get document symbols for the file
                let symbols: vscode.DocumentSymbol[] | undefined;
                try {
                    symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                        'vscode.executeDocumentSymbolProvider',
                        uri
                    );
                } catch (error) {
                    console.warn(`Could not get symbols for ${uri.fsPath}:`, error);
                    continue;
                }

                if (!symbols) {
                    console.warn(`No symbols found for ${uri.fsPath}`);
                    continue;
                }

                // Find calling methods for each reference
                for (const location of filteredLocations) {
                    const callingMethod = this.findContainingMethod(location.range, symbols);
                    if (callingMethod) {
                        // Check if we already have this calling method to avoid duplicates
                        const existingChild = callInfo.children.find(child => 
                            child.methodName === callingMethod.name && 
                            child.uri.toString() === uri.toString() &&
                            child.range.isEqual(callingMethod.selectionRange)
                        );

                        if (!existingChild) {
                            console.log(`Found calling method: ${callingMethod.name} in ${uri.fsPath}`);
                            const childCallInfo: MethodCallInfo = {
                                methodName: callingMethod.name,
                                uri: uri,
                                range: callingMethod.selectionRange,
                                callerMethodName: callInfo.methodName,
                                depth: currentDepth + 1,
                                children: []
                            };

                            // Recursively find calls to this calling method
                            await this.findMethodReferencesWorkspace(childCallInfo, currentDepth + 1);
                            callInfo.children.push(childCallInfo);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error finding method references in workspace:', error);
        }
    }

    // New method to search workspace using VS Code's search functionality
    private async searchWorkspaceForMethod(methodName: string): Promise<vscode.Location[]> {
        try {
            // Get all relevant files in the workspace
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}',
                '**/node_modules/**'
            );

            const locations: vscode.Location[] = [];

            // Search each file for the method name
            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const text = document.getText();
                    
                    // Look for method calls (simple regex pattern)
                    const regex = new RegExp(`\\b${methodName}\\s*\\(`, 'g');
                    let match;
                    
                    while ((match = regex.exec(text)) !== null) {
                        const position = document.positionAt(match.index);
                        const range = new vscode.Range(position, position.translate(0, methodName.length));
                        locations.push(new vscode.Location(file, range));
                    }
                } catch (error) {
                    console.warn(`Could not search file ${file.fsPath}:`, error);
                }
            }

            return locations;
        } catch (error) {
            console.error('Error searching workspace:', error);
            return [];
        }
    }

    private findContainingMethod(range: vscode.Range, symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            // Check if this symbol contains the range and is a method/function
            if ((symbol.kind === vscode.SymbolKind.Method || 
                 symbol.kind === vscode.SymbolKind.Function ||
                 symbol.kind === vscode.SymbolKind.Constructor) &&
                symbol.range.contains(range)) {
                return symbol;
            }

            // Check children recursively
            if (symbol.children && symbol.children.length > 0) {
                const found = this.findContainingMethod(range, symbol.children);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    // New method to get workspace statistics
    async getWorkspaceStats(): Promise<{totalFiles: number, supportedFiles: number}> {
        try {
            const workspaceFiles = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}', // Common programming file extensions
                '**/node_modules/**' // Exclude node_modules
            );
            
            return {
                totalFiles: workspaceFiles.length,
                supportedFiles: workspaceFiles.length
            };
        } catch (error) {
            console.error('Error getting workspace stats:', error);
            return { totalFiles: 0, supportedFiles: 0 };
        }
    }
}

// Method Call Tree Data Provider
class MethodCallTreeDataProvider implements vscode.TreeDataProvider<MethodCallTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MethodCallTreeItem | undefined | null | void> = new vscode.EventEmitter<MethodCallTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MethodCallTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentCallTree: MethodCallInfo | null = null;
    private analysisService: MethodCallAnalysisService;

    constructor() {
        this.analysisService = new MethodCallAnalysisService();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async analyzeMethod(methodSymbol: vscode.DocumentSymbol, uri: vscode.Uri): Promise<void> {
        try {
            // Get workspace stats for better progress indication
            const stats = await this.analysisService.getWorkspaceStats();
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Analyzing method calls for "${methodSymbol.name}" across workspace...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ 
                    message: `Preparing workspace analysis (${stats.totalFiles} files)...`,
                    increment: 10 
                });
                
                // Ensure workspace is indexed by opening a few files
                await this.ensureWorkspaceIndexed();
                
                progress.report({ 
                    message: `Searching for references across workspace...`,
                    increment: 30 
                });
                
                this.currentCallTree = await this.analysisService.analyzeMethodCalls(methodSymbol, uri);
                
                progress.report({ 
                    message: `Analysis complete!`,
                    increment: 100 
                });
                
                this.refresh();
                
                // Show summary
                if (this.currentCallTree) {
                    const totalCalls = this.countTotalCalls(this.currentCallTree);
                    const uniqueFiles = this.countUniqueFiles(this.currentCallTree);
                    vscode.window.showInformationMessage(
                        `Found ${totalCalls} method calls across ${uniqueFiles} files (searched ${stats.totalFiles} workspace files)`
                    );
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to analyze method calls: ${error}`);
        }
    }

    private async ensureWorkspaceIndexed(): Promise<void> {
        try {
            // Get a few representative files to ensure indexing
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx}',
                '**/node_modules/**',
                10 // Limit to first 10 files
            );

            // Open and close files to trigger indexing
            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    // Just opening the document helps ensure it's indexed
                    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
                } catch (error) {
                    // Ignore errors for individual files
                }
            }
        } catch (error) {
            console.warn('Error ensuring workspace indexing:', error);
        }
    }

    private countTotalCalls(callInfo: MethodCallInfo): number {
        let count = callInfo.children.length;
        for (const child of callInfo.children) {
            count += this.countTotalCalls(child);
        }
        return count;
    }

    private countUniqueFiles(callInfo: MethodCallInfo): number {
        const files = new Set<string>();
        this.collectFiles(callInfo, files);
        return files.size;
    }

    private collectFiles(callInfo: MethodCallInfo, files: Set<string>): void {
        files.add(callInfo.uri.toString());
        for (const child of callInfo.children) {
            this.collectFiles(child, files);
        }
    }

    setMaxDepth(depth: number): void {
        this.analysisService.setMaxDepth(depth);
        // Re-analyze if we have a current tree
        if (this.currentCallTree) {
            const rootMethod = {
                name: this.currentCallTree.methodName,
                detail: '',
                kind: vscode.SymbolKind.Method,
                range: this.currentCallTree.range,
                selectionRange: this.currentCallTree.range,
                children: []
            };
            this.analyzeMethod(rootMethod, this.currentCallTree.uri);
        }
    }

    getMaxDepth(): number {
        return this.analysisService.getMaxDepth();
    }

    clearAnalysis(): void {
        this.currentCallTree = null;
        this.refresh();
    }

    getTreeItem(element: MethodCallTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MethodCallTreeItem): Thenable<MethodCallTreeItem[]> {
        if (!this.currentCallTree) {
            return Promise.resolve([this.createPlaceholderItem('Select a method to analyze calls')]);
        }

        if (element) {
            // Return children of the given call
            return Promise.resolve(this.getCallChildren(element.callInfo));
        } else {
            // Return root call
            const hasChildren = this.currentCallTree.children.length > 0;
            const collapsibleState = hasChildren ? 
                vscode.TreeItemCollapsibleState.Expanded : 
                vscode.TreeItemCollapsibleState.None;
            
            return Promise.resolve([new MethodCallTreeItem(this.currentCallTree, collapsibleState)]);
        }
    }

    private getCallChildren(callInfo: MethodCallInfo): MethodCallTreeItem[] {
        return callInfo.children.map(child => {
            const hasChildren = child.children.length > 0;
            const collapsibleState = hasChildren ? 
                vscode.TreeItemCollapsibleState.Collapsed : 
                vscode.TreeItemCollapsibleState.None;
            
            return new MethodCallTreeItem(child, collapsibleState);
        });
    }

    private createPlaceholderItem(message: string): MethodCallTreeItem {
        // Create a dummy call info for the placeholder
        const dummyCallInfo: MethodCallInfo = {
            methodName: message,
            uri: vscode.Uri.file(''),
            range: new vscode.Range(0, 0, 0, 0),
            depth: 0,
            children: []
        };
        
        const item = new MethodCallTreeItem(dummyCallInfo, vscode.TreeItemCollapsibleState.None);
        item.command = undefined; // Remove the click command for placeholder items
        item.contextValue = 'placeholder';
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }
}

// Symbol Tree Item class to represent individual symbols
class SymbolTreeItem extends vscode.TreeItem {
    constructor(
        public readonly symbol: vscode.DocumentSymbol,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parent?: SymbolTreeItem
    ) {
        super(symbol.name, collapsibleState);
        
        this.tooltip = `${symbol.name} (${vscode.SymbolKind[symbol.kind]})`;
        this.description = this.getSymbolDescription();
        this.iconPath = this.getSymbolIcon();
        
        // Add range information as context value for potential commands
        this.contextValue = `symbol-${vscode.SymbolKind[symbol.kind].toLowerCase()}`;
        
        // Make the item clickable to navigate to symbol location
        this.command = {
            command: 'recalls.goToSymbol',
            title: 'Go to Symbol',
            arguments: [this]
        };
    }

    private getSymbolDescription(): string {
        const range = this.symbol.range;
        const line = range.start.line + 1; // Convert to 1-based line numbers
        return `Line ${line}`;
    }

    private getSymbolIcon(): vscode.ThemeIcon {
        switch (this.symbol.kind) {
            case vscode.SymbolKind.Class:
                return new vscode.ThemeIcon('symbol-class');
            case vscode.SymbolKind.Method:
                return new vscode.ThemeIcon('symbol-method');
            case vscode.SymbolKind.Function:
                return new vscode.ThemeIcon('symbol-function');
            case vscode.SymbolKind.Property:
                return new vscode.ThemeIcon('symbol-property');
            case vscode.SymbolKind.Field:
                return new vscode.ThemeIcon('symbol-field');
            case vscode.SymbolKind.Variable:
                return new vscode.ThemeIcon('symbol-variable');
            case vscode.SymbolKind.Interface:
                return new vscode.ThemeIcon('symbol-interface');
            case vscode.SymbolKind.Enum:
                return new vscode.ThemeIcon('symbol-enum');
            case vscode.SymbolKind.EnumMember:
                return new vscode.ThemeIcon('symbol-enum-member');
            case vscode.SymbolKind.Constructor:
                return new vscode.ThemeIcon('symbol-constructor');
            case vscode.SymbolKind.Module:
                return new vscode.ThemeIcon('symbol-module');
            case vscode.SymbolKind.Namespace:
                return new vscode.ThemeIcon('symbol-namespace');
            case vscode.SymbolKind.Constant:
                return new vscode.ThemeIcon('symbol-constant');
            default:
                return new vscode.ThemeIcon('symbol-misc');
        }
    }
}

// Symbols Tree Data Provider
class SymbolsTreeDataProvider implements vscode.TreeDataProvider<SymbolTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SymbolTreeItem | undefined | null | void> = new vscode.EventEmitter<SymbolTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SymbolTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private symbols: vscode.DocumentSymbol[] = [];
    private currentDocument: vscode.TextDocument | undefined;

    constructor() {
        // Listen for active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.refresh();
        });

        // Listen for document changes
        vscode.workspace.onDidChangeTextDocument(() => {
            this.refresh();
        });

        // Initial load
        this.refresh();
    }

    refresh(): void {
        this.loadSymbols();
        this._onDidChangeTreeData.fire();
    }

    private async loadSymbols(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            this.symbols = [];
            this.currentDocument = undefined;
            return;
        }

        this.currentDocument = activeEditor.document;
        
        try {
            // Get document symbols using VS Code's built-in symbol provider
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                this.currentDocument.uri
            );
            
            this.symbols = symbols || [];
        } catch (error) {
            console.error('Error loading symbols:', error);
            this.symbols = [];
        }
    }

    getTreeItem(element: SymbolTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SymbolTreeItem): Thenable<SymbolTreeItem[]> {
        if (!this.currentDocument) {
            return Promise.resolve([this.createPlaceholderItem('No active file')]);
        }

        if (element) {
            // Return children of the given symbol
            return Promise.resolve(this.getSymbolChildren(element.symbol, element));
        } else {
            // Return root symbols
            const children = this.getSymbolChildren();
            if (children.length === 0) {
                // Return a placeholder when no symbols are found
                return Promise.resolve([this.createPlaceholderItem('No symbols found')]);
            }
            return Promise.resolve(children);
        }
    }

    private createPlaceholderItem(message: string): SymbolTreeItem {
        // Create a dummy symbol for the placeholder
        const dummySymbol: vscode.DocumentSymbol = {
            name: message,
            detail: '',
            kind: vscode.SymbolKind.Null,
            range: new vscode.Range(0, 0, 0, 0),
            selectionRange: new vscode.Range(0, 0, 0, 0),
            children: []
        };
        
        const item = new SymbolTreeItem(dummySymbol, vscode.TreeItemCollapsibleState.None);
        item.command = undefined; // Remove the click command for placeholder items
        item.contextValue = 'placeholder';
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }

    private getSymbolChildren(parentSymbol?: vscode.DocumentSymbol, parentItem?: SymbolTreeItem): SymbolTreeItem[] {
        const symbols = parentSymbol ? parentSymbol.children : this.symbols;
        
        return symbols.map(symbol => {
            const hasChildren = symbol.children && symbol.children.length > 0;
            const collapsibleState = hasChildren ? 
                vscode.TreeItemCollapsibleState.Collapsed : 
                vscode.TreeItemCollapsibleState.None;
            
            return new SymbolTreeItem(symbol, collapsibleState, parentItem);
        });
    }
}

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

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('recalls.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Recalls VS Code. We are setup now!');
	});

	// Command to refresh symbols manually
	const refreshCommand = vscode.commands.registerCommand('recalls.refreshSymbols', () => {
		symbolsProvider.refresh();
	});

	// Command to go to symbol location when clicked
	const goToSymbolCommand = vscode.commands.registerCommand('recalls.goToSymbol', (item: SymbolTreeItem) => {
		if (vscode.window.activeTextEditor && item.symbol) {
			const range = item.symbol.range;
			vscode.window.activeTextEditor.selection = new vscode.Selection(range.start, range.start);
			vscode.window.activeTextEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
		}
	});

	// Command to analyze method calls
	const analyzeMethodCommand = vscode.commands.registerCommand('recalls.analyzeMethod', async (item: SymbolTreeItem) => {
		if (item && item.symbol && vscode.window.activeTextEditor) {
			const symbol = item.symbol;
			if (symbol.kind === vscode.SymbolKind.Method || 
				symbol.kind === vscode.SymbolKind.Function ||
				symbol.kind === vscode.SymbolKind.Constructor) {
				await methodCallProvider.analyzeMethod(symbol, vscode.window.activeTextEditor.document.uri);
			} else {
				vscode.window.showWarningMessage('Please select a method, function, or constructor to analyze.');
			}
		}
	});

	// Command to go to method call location
	const goToMethodCallCommand = vscode.commands.registerCommand('recalls.goToMethodCall', async (item: MethodCallTreeItem) => {
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

	// Command to set analysis depth
	const setDepthCommand = vscode.commands.registerCommand('recalls.setAnalysisDepth', async () => {
		const currentDepth = methodCallProvider.getMaxDepth();
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
			methodCallProvider.setMaxDepth(depth);
			vscode.window.showInformationMessage(`Analysis depth set to ${depth}`);
		}
	});

	// Command to clear method analysis
	const clearAnalysisCommand = vscode.commands.registerCommand('recalls.clearAnalysis', () => {
		methodCallProvider.clearAnalysis();
		vscode.window.showInformationMessage('Method call analysis cleared');
	});

	// Command to refresh method calls
	const refreshMethodCallsCommand = vscode.commands.registerCommand('recalls.refreshMethodCalls', () => {
		methodCallProvider.refresh();
	});

	// Command to show workspace analysis info
	const showWorkspaceInfoCommand = vscode.commands.registerCommand('recalls.showWorkspaceInfo', async () => {
		try {
			const stats = await methodCallProvider['analysisService'].getWorkspaceStats();
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const folderNames = workspaceFolders?.map(folder => folder.name).join(', ') || 'No workspace';
			
			vscode.window.showInformationMessage(
				`Workspace Analysis Info:\n` +
				`• Folders: ${folderNames}\n` +
				`• Total files: ${stats.totalFiles}\n` +
				`• Supported files: ${stats.supportedFiles}\n` +
				`• Current depth: ${methodCallProvider.getMaxDepth()}`,
				{ modal: false }
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to get workspace info: ${error}`);
		}
	});

	// Command to analyze method from current cursor position
	const analyzeMethodAtCursorCommand = vscode.commands.registerCommand('recalls.analyzeMethodAtCursor', async () => {
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
		const methodAtCursor = findMethodAtPosition(position, symbols);
		if (methodAtCursor) {
			await methodCallProvider.analyzeMethod(methodAtCursor, activeEditor.document.uri);
		} else {
			vscode.window.showWarningMessage('No method found at cursor position');
		}
	});

	// Command to enable debug output
	const enableDebugCommand = vscode.commands.registerCommand('recalls.enableDebug', () => {
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

	// Helper function to find method at position
	function findMethodAtPosition(position: vscode.Position, symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null {
		for (const symbol of symbols) {
			if ((symbol.kind === vscode.SymbolKind.Method || 
				 symbol.kind === vscode.SymbolKind.Function ||
				 symbol.kind === vscode.SymbolKind.Constructor) &&
				symbol.range.contains(position)) {
				return symbol;
			}

			if (symbol.children && symbol.children.length > 0) {
				const found = findMethodAtPosition(position, symbol.children);
				if (found) {
					return found;
				}
			}
		}
		return null;
	}

	// Register all disposables
	context.subscriptions.push(
		disposable,
		symbolsTreeView,
		methodCallTreeView,
		refreshCommand,
		goToSymbolCommand,
		analyzeMethodCommand,
		goToMethodCallCommand,
		setDepthCommand,
		clearAnalysisCommand,
		refreshMethodCallsCommand,
		showWorkspaceInfoCommand,
		analyzeMethodAtCursorCommand,
		enableDebugCommand
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
