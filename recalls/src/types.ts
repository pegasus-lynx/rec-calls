import * as vscode from 'vscode';

// Interface for method call information
export interface MethodCallInfo {
    methodName: string;
    uri: vscode.Uri;
    range: vscode.Range;
    callerMethodName?: string;
    depth: number;
    children: MethodCallInfo[];
}

// Statistics about workspace analysis
export interface WorkspaceStats {
    totalFiles: number;
    supportedFiles: number;
}

// Configuration for analysis depth
export interface AnalysisConfig {
    maxDepth: number;
}