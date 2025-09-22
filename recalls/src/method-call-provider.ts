import * as vscode from 'vscode';
import { MethodCallInfo } from './types';
import { MethodCallAnalysisService } from './method-analysis-service';

// Method Call Tree Item class
export class MethodCallTreeItem extends vscode.TreeItem {
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

// Method Call Tree Data Provider
export class MethodCallTreeDataProvider implements vscode.TreeDataProvider<MethodCallTreeItem> {
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
                    message: `Using cached symbols (${stats.supportedFiles}/${stats.totalFiles} files indexed)...`,
                    increment: 20 
                });
                
                progress.report({ 
                    message: `Searching for references across workspace...`,
                    increment: 50 
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
                        `Found ${totalCalls} method calls across ${uniqueFiles} files (analyzed ${stats.supportedFiles} cached files)`
                    );
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to analyze method calls: ${error}`);
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

    getAnalysisService(): MethodCallAnalysisService {
        return this.analysisService;
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
}