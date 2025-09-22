import * as vscode from 'vscode';
import { InternalMethodCallInfo, InternalCallAnalysisResult } from './types';
import { WorkspaceSymbolCache } from './workspace-symbol-cache';

/**
 * Service for analyzing method calls made within a method body
 * This analyzes what methods are called FROM within a method, not what calls TO a method
 */
export class InternalMethodCallAnalysisService {
    private maxDepth: number = 3;
    private processedMethods: Set<string> = new Set();
    private symbolCache: WorkspaceSymbolCache;

    constructor() {
        this.symbolCache = WorkspaceSymbolCache.getInstance();
    }

    setMaxDepth(depth: number): void {
        this.maxDepth = Math.max(1, Math.min(depth, 10));
    }

    getMaxDepth(): number {
        return this.maxDepth;
    }

    /**
     * Analyze all method calls made within a given method
     */
    async analyzeInternalMethodCalls(
        methodSymbol: vscode.DocumentSymbol, 
        uri: vscode.Uri
    ): Promise<InternalCallAnalysisResult | null> {
        try {
            // Clear processed methods for new analysis
            this.processedMethods.clear();

            console.log(`Starting internal analysis for method: ${methodSymbol.name}`);

            // Get the document to analyze method body content
            const document = await vscode.workspace.openTextDocument(uri);
            const methodText = document.getText(methodSymbol.range);

            // Find all method calls within this method
            const internalCalls = await this.findMethodCallsInText(
                methodText, 
                methodSymbol.range, 
                uri, 
                0
            );

            const result: InternalCallAnalysisResult = {
                rootMethod: methodSymbol.name,
                rootUri: uri,
                rootRange: methodSymbol.selectionRange,
                calls: internalCalls,
                totalCallsFound: this.countTotalCalls(internalCalls),
                analysisDepth: this.maxDepth
            };

            console.log(`Analysis complete. Found ${result.totalCallsFound} total calls.`);
            return result;

        } catch (error) {
            console.error('Error analyzing internal method calls:', error);
            return null;
        }
    }

    /**
     * Find method calls within the given text
     */
    private async findMethodCallsInText(
        text: string,
        baseRange: vscode.Range,
        uri: vscode.Uri,
        currentDepth: number
    ): Promise<InternalMethodCallInfo[]> {
        const calls: InternalMethodCallInfo[] = [];

        if (currentDepth >= this.maxDepth) {
            return calls;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        
        // Find all method calls using a single comprehensive regex
        const allMatches = this.findAllMethodCallMatches(text);
        
        // Sort matches by position to maintain order
        allMatches.sort((a, b) => a.index - b.index);

        for (const match of allMatches) {
            if (!match.methodName || this.isBuiltInOrCommon(match.methodName)) {
                continue;
            }

            // Calculate the position within the document
            const startOffset = document.offsetAt(baseRange.start) + match.index;
            const endOffset = startOffset + match.methodName.length;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            const callRange = new vscode.Range(startPos, endPos);

            // Try to find the definition of this method
            const definition = await this.findMethodDefinition(match.methodName, uri);

            // Check for recursion
            const methodKey = definition ? 
                `${definition.uri.toString()}:${definition.range.start.line}:${definition.range.start.character}` :
                `unknown:${match.methodName}`;
            const isRecursive = this.processedMethods.has(methodKey);

            const callInfo: InternalMethodCallInfo = {
                methodName: match.methodName,
                uri,
                range: callRange,
                definitionUri: definition?.uri,
                definitionRange: definition?.range,
                depth: currentDepth,
                children: [],
                isResolved: definition !== null,
                isRecursive
            };

            // If we found the definition and it's not recursive, analyze its internal calls
            if (definition && !isRecursive) {
                this.processedMethods.add(methodKey);
                
                try {
                    const defDocument = await vscode.workspace.openTextDocument(definition.uri);
                    const symbols = await this.symbolCache.getSymbolsForFile(definition.uri);
                    const defMethod = this.findSymbolAtRange(symbols, definition.range);
                    
                    if (defMethod) {
                        const defMethodText = defDocument.getText(defMethod.range);
                        callInfo.children = await this.findMethodCallsInText(
                            defMethodText,
                            defMethod.range,
                            definition.uri,
                            currentDepth + 1
                        );
                        callInfo.children.shift();
                    }
                } catch (error) {
                    console.warn(`Could not analyze definition for ${match.methodName}:`, error);
                }
            }

            calls.push(callInfo);

            if(currentDepth < 1)
            {
                break;
            }
        }

        return this.removeDuplicateCalls(calls);
    }

    /**
     * Find all method call matches in text using a comprehensive approach
     */
    private findAllMethodCallMatches(text: string): Array<{methodName: string, index: number}> {
        const matches: Array<{methodName: string, index: number}> = [];
        
        // Single comprehensive regex that handles all method call patterns
        // This regex captures method calls while avoiding duplicates
        const methodCallRegex = /(?:^|[^.\w])(\w+)\s*\(/g;
        
        let match;
        while ((match = methodCallRegex.exec(text)) !== null) {
            const methodName = match[1];
            // Calculate the actual start position of the method name
            const methodStartIndex = match.index + match[0].indexOf(methodName);
            
            matches.push({
                methodName: methodName,
                index: methodStartIndex
            });
        }

        // Also find property method calls (object.method())
        const propertyMethodRegex = /\.(\w+)\s*\(/g;
        
        while ((match = propertyMethodRegex.exec(text)) !== null) {
            const methodName = match[1];
            // Calculate the actual start position of the method name (after the dot)
            const methodStartIndex = match.index + 1; // +1 to skip the dot
            
            matches.push({
                methodName: methodName,
                index: methodStartIndex
            });
        }

        return matches;
    }

    /**
     * Find the definition of a method within the workspace
     */
    private async findMethodDefinition(
        methodName: string, 
        currentUri: vscode.Uri
    ): Promise<{uri: vscode.Uri, range: vscode.Range} | null> {
        try {
            // First, try using the method name cache for fast lookup
            const methodInfo = this.symbolCache.findMethodDefinition(methodName, currentUri);
            if (methodInfo) {
                return { 
                    uri: methodInfo.uri, 
                    range: methodInfo.symbol.selectionRange 
                };
            }

            // Fallback: try VS Code's built-in definition provider (limited effectiveness)
            const position = new vscode.Position(0, 0); // Dummy position
            const definitions = await vscode.commands.executeCommand<vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider',
                currentUri,
                position
            );

            // If VS Code definition provider found something
            if (definitions && definitions.length > 0) {
                const def = definitions[0];
                return {
                    uri: def.targetUri,
                    range: def.targetRange
                };
            }

            return null;
        } catch (error) {
            console.warn(`Could not find definition for ${methodName}:`, error);
            return null;
        }
    }

    /**
     * Find a method symbol by name in symbol tree (kept for backward compatibility)
     */
    private findMethodInSymbols(
        methodName: string, 
        symbols: vscode.DocumentSymbol[]
    ): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            if ((symbol.kind === vscode.SymbolKind.Method || 
                 symbol.kind === vscode.SymbolKind.Function ||
                 symbol.kind === vscode.SymbolKind.Constructor) &&
                symbol.name === methodName) {
                return symbol;
            }

            if (symbol.children && symbol.children.length > 0) {
                const found = this.findMethodInSymbols(methodName, symbol.children);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    /**
     * Find a symbol at a specific range
     */
    private findSymbolAtRange(
        symbols: vscode.DocumentSymbol[], 
        range: vscode.Range
    ): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            if (symbol.selectionRange.isEqual(range) || symbol.range.contains(range)) {
                // Check if this is the exact symbol or look in children
                if (symbol.selectionRange.isEqual(range)) {
                    return symbol;
                }
                
                if (symbol.children && symbol.children.length > 0) {
                    const found = this.findSymbolAtRange(symbol.children, range);
                    if (found) {
                        return found;
                    }
                }
                
                // If no children match exactly, return this symbol if it contains the range
                return symbol;
            }
        }
        return null;
    }

    /**
     * Filter out built-in or very common method names that aren't relevant
     */
    private isBuiltInOrCommon(methodName: string): boolean {
        const builtInMethods = [
            'console', 'log', 'error', 'warn', 'info', 'debug',
            'push', 'pop', 'shift', 'unshift', 'slice', 'splice',
            'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
            'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
            'length', 'indexOf', 'lastIndexOf', 'charAt', 'charCodeAt',
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return',
            'var', 'let', 'const', 'function', 'class', 'import', 'export',
            'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof',
            'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'
        ];

        return builtInMethods.includes(methodName.toLowerCase()) || 
               methodName.length < 2 || 
               /^\d/.test(methodName); // Starts with number
    }

    /**
     * Remove duplicate calls from the list
     */
    private removeDuplicateCalls(calls: InternalMethodCallInfo[]): InternalMethodCallInfo[] {
        const seen = new Set<string>();
        return calls.filter(call => {
            // Use position-based key to allow same method name at different positions
            const key = `${call.methodName}:${call.range.start.line}:${call.range.start.character}:${call.uri.toString()}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Count total calls including children recursively
     */
    private countTotalCalls(calls: InternalMethodCallInfo[]): number {
        let total = calls.length;
        for (const call of calls) {
            total += this.countTotalCalls(call.children);
        }
        return total;
    }
}