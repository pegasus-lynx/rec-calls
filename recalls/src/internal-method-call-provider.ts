import * as vscode from 'vscode';
import { InternalMethodCallInfo, InternalCallAnalysisResult } from './types';

export class InternalMethodCallTreeItem extends vscode.TreeItem {
    constructor(
        public readonly methodCall: InternalMethodCallInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(methodCall.methodName, collapsibleState);
        
        this.tooltip = this.generateTooltip();
        this.description = this.generateDescription();
        this.contextValue = 'internal-method-call';
        this.iconPath = this.getIcon();
        
        // Set command to go to the call location when clicked
        this.command = {
            command: 'recalls.goToInternalCall',
            title: 'Go to Call',
            arguments: [this.methodCall]
        };
    }

    private generateTooltip(): string {
        const location = `${this.methodCall.uri.fsPath}:${this.methodCall.range.start.line + 1}`;
        let tooltip = `${this.methodCall.methodName}\nCall at: ${location}`;
        
        if (this.methodCall.isResolved && this.methodCall.definitionUri) {
            const defLocation = `${this.methodCall.definitionUri.fsPath}:${this.methodCall.definitionRange!.start.line + 1}`;
            tooltip += `\nDefined at: ${defLocation}`;
        } else {
            tooltip += '\nDefinition: Not found';
        }
        
        if (this.methodCall.isRecursive) {
            tooltip += '\n⚠️ Recursive call detected';
        }
        
        if (this.methodCall.children.length > 0) {
            tooltip += `\nCalls ${this.methodCall.children.length} method(s)`;
        }
        
        return tooltip;
    }

    private generateDescription(): string {
        let desc = `(depth: ${this.methodCall.depth})`;
        
        if (this.methodCall.isRecursive) {
            desc += ' ♻️';
        }
        
        if (!this.methodCall.isResolved) {
            desc += ' ❓';
        }
        
        if (this.methodCall.children.length > 0) {
            desc += ` → ${this.methodCall.children.length}`;
        }
        
        return desc;
    }

    private getIcon(): vscode.ThemeIcon {
        if (this.methodCall.isRecursive) {
            return new vscode.ThemeIcon('sync', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        }
        
        if (!this.methodCall.isResolved) {
            return new vscode.ThemeIcon('question', new vscode.ThemeColor('problemsInfoIcon.foreground'));
        }
        
        if (this.methodCall.children.length > 0) {
            return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
        }
        
        return new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('symbolIcon.functionForeground'));
    }
}

export class InternalMethodCallTreeDataProvider implements vscode.TreeDataProvider<InternalMethodCallTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<InternalMethodCallTreeItem | undefined | null | void> = new vscode.EventEmitter<InternalMethodCallTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<InternalMethodCallTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private analysisResult: InternalCallAnalysisResult | null = null;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.analysisResult = null;
        this.refresh();
    }

    setAnalysisResult(result: InternalCallAnalysisResult | null): void {
        this.analysisResult = result;
        this.refresh();
    }

    getAnalysisResult(): InternalCallAnalysisResult | null {
        return this.analysisResult;
    }

    getTreeItem(element: InternalMethodCallTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: InternalMethodCallTreeItem): Thenable<InternalMethodCallTreeItem[]> {
        if (!this.analysisResult) {
            return Promise.resolve([this.createPlaceholderItem('No internal analysis available. Select a method and click "Analyze Internal Calls".')]);
        }

        if (!element) {
            // Root level - show analysis summary and top-level calls
            const items: InternalMethodCallTreeItem[] = [];
            
            // Add summary item
            items.push(this.createSummaryItem());
            
            // Add all top-level method calls
            for (const call of this.analysisResult.calls) {
                const hasChildren = call.children && call.children.length > 0;
                const collapsibleState = hasChildren ? 
                    vscode.TreeItemCollapsibleState.Collapsed : 
                    vscode.TreeItemCollapsibleState.None;
                items.push(new InternalMethodCallTreeItem(call, collapsibleState));
            }
            
            return Promise.resolve(items);
        } else {
            // Show children of the selected call
            const children: InternalMethodCallTreeItem[] = [];
            for (const child of element.methodCall.children) {
                const hasChildren = child.children && child.children.length > 0;
                const collapsibleState = hasChildren ? 
                    vscode.TreeItemCollapsibleState.Collapsed : 
                    vscode.TreeItemCollapsibleState.None;
                children.push(new InternalMethodCallTreeItem(child, collapsibleState));
            }
            return Promise.resolve(children);
        }
    }

    private createSummaryItem(): InternalMethodCallTreeItem {
        const summaryCall: InternalMethodCallInfo = {
            methodName: `📊 ${this.analysisResult!.rootMethod}`,
            uri: this.analysisResult!.rootUri,
            range: this.analysisResult!.rootRange,
            depth: -1,
            children: [],
            isResolved: true
        };

        const item = new InternalMethodCallTreeItem(summaryCall, vscode.TreeItemCollapsibleState.None);
        item.description = `${this.analysisResult!.totalCallsFound} calls found (depth: ${this.analysisResult!.analysisDepth})`;
        item.tooltip = `Analysis Summary\nRoot Method: ${this.analysisResult!.rootMethod}\nTotal Calls Found: ${this.analysisResult!.totalCallsFound}\nMax Analysis Depth: ${this.analysisResult!.analysisDepth}\nLocation: ${this.analysisResult!.rootUri.fsPath}:${this.analysisResult!.rootRange.start.line + 1}`;
        item.contextValue = 'analysis-summary';
        item.iconPath = new vscode.ThemeIcon('graph');
        
        // Command to go to root method
        item.command = {
            command: 'recalls.goToInternalCall',
            title: 'Go to Method',
            arguments: [summaryCall]
        };
        
        return item;
    }

    private createPlaceholderItem(message: string): InternalMethodCallTreeItem {
        const placeholderCall: InternalMethodCallInfo = {
            methodName: message,
            uri: vscode.Uri.parse(''),
            range: new vscode.Range(0, 0, 0, 0),
            depth: 0,
            children: [],
            isResolved: false
        };

        const item = new InternalMethodCallTreeItem(placeholderCall, vscode.TreeItemCollapsibleState.None);
        item.description = '';
        item.tooltip = message;
        item.contextValue = 'placeholder';
        item.iconPath = new vscode.ThemeIcon('info');
        item.command = undefined;
        
        return item;
    }

    // Helper method to get all method calls (including nested) for commands
    getAllMethodCalls(): InternalMethodCallInfo[] {
        if (!this.analysisResult) {
            return [];
        }
        
        const allCalls: InternalMethodCallInfo[] = [];
        
        const collectCalls = (calls: InternalMethodCallInfo[]) => {
            for (const call of calls) {
                allCalls.push(call);
                if (call.children && call.children.length > 0) {
                    collectCalls(call.children);
                }
            }
        };
        
        collectCalls(this.analysisResult.calls);
        return allCalls;
    }

    // Get statistics for display
    getStatistics() {
        if (!this.analysisResult) {
            return null;
        }
        
        const allCalls = this.getAllMethodCalls();
        const resolvedCalls = allCalls.filter(call => call.isResolved).length;
        const unresolvedCalls = allCalls.filter(call => !call.isResolved).length;
        const recursiveCalls = allCalls.filter(call => call.isRecursive).length;
        
        return {
            totalCalls: allCalls.length,
            resolvedCalls,
            unresolvedCalls,
            recursiveCalls,
            maxDepthReached: Math.max(...allCalls.map(call => call.depth), 0),
            rootMethod: this.analysisResult.rootMethod
        };
    }
}