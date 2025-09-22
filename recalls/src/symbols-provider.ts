import * as vscode from 'vscode';

// Symbol Tree Item class to represent individual symbols
export class SymbolTreeItem extends vscode.TreeItem {
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
export class SymbolsTreeDataProvider implements vscode.TreeDataProvider<SymbolTreeItem> {
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