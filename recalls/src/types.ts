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

// Interface for internal method call information (calls made within a method)
export interface InternalMethodCallInfo {
    methodName: string;
    uri: vscode.Uri;
    range: vscode.Range; // Location where the call is made
    definitionUri?: vscode.Uri; // URI where the called method is defined
    definitionRange?: vscode.Range; // Range where the called method is defined
    depth: number;
    children: InternalMethodCallInfo[]; // Calls made within this called method
    isResolved: boolean; // Whether we found the method definition
    isRecursive?: boolean; // Whether this call creates a recursive loop
}

// Interface for cached method information
export interface CachedMethodInfo {
    methodName: string;
    uri: vscode.Uri;
    symbol: vscode.DocumentSymbol;
    filePath: string;
}

// Interface for method reference information
export interface MethodReferenceInfo {
    methodName: string;
    uri: vscode.Uri;
    range: vscode.Range;
    filePath: string;
    containingMethod?: string; // The method that contains this reference
}

// Root analysis result for internal method calls
export interface InternalCallAnalysisResult {
    rootMethod: string;
    rootUri: vscode.Uri;
    rootRange: vscode.Range;
    calls: InternalMethodCallInfo[];
    totalCallsFound: number;
    analysisDepth: number;
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