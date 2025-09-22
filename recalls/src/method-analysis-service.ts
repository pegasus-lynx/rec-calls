import * as vscode from 'vscode';
import { MethodCallInfo, WorkspaceStats } from './types';
import { WorkspaceSymbolCache } from './workspace-symbol-cache';

// Method Call Analysis Service
export class MethodCallAnalysisService {
    private maxDepth: number = 3;
    private processedMethods: Set<string> = new Set(); // Track processed methods to avoid infinite recursion
    private symbolCache: WorkspaceSymbolCache;

    constructor() {
        this.symbolCache = WorkspaceSymbolCache.getInstance();
    }

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
            // try {
            //     const refs1 = await vscode.commands.executeCommand<vscode.Location[]>(
            //         'vscode.executeReferenceProvider',
            //         callInfo.uri,
            //         callInfo.range.start
            //     );
            //     if (refs1) {
            //         references = refs1;
            //     }
            // } catch (error) {
            //     console.warn('Reference provider failed:', error);
            // }

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

                // Get document symbols for the file using cache for better performance
                let symbols: vscode.DocumentSymbol[] | undefined;
                try {
                    symbols = await this.symbolCache.getSymbolsForFile(uri);
                } catch (error) {
                    console.warn(`Could not get symbols for ${uri.fsPath}:`, error);
                    continue;
                }

                if (!symbols || symbols.length === 0) {
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

    // Enhanced method to search workspace using cached symbols when possible
    private async searchWorkspaceForMethod(methodName: string): Promise<vscode.Location[]> {
        try {
            console.log(`Searching for method references: ${methodName}`);
            
            // First, try to use cached references for a fast search
            const cacheStats = this.symbolCache.getCacheStats();
            if (cacheStats.totalReferences > 0) {
                console.log(`Using cached references for search (${cacheStats.totalReferences} references cached)`);
                return await this.searchCachedReferences(methodName);
            }
            
            // Fallback to cached symbols search if reference cache is not ready
            console.log('Reference cache not ready, falling back to symbol-based search');
            return await this.searchCachedSymbols(methodName);
        } catch (error) {
            console.error('Error searching workspace:', error);
            return [];
        }
    }

    // Search using cached method references (fastest and most accurate)
    private async searchCachedReferences(methodName: string): Promise<vscode.Location[]> {
        const locations: vscode.Location[] = [];
        
        // Get method references from cache
        const methodReferences = this.symbolCache.findMethodReferences(methodName);
        
        // Convert reference info to VS Code locations
        for (const ref of methodReferences) {
            locations.push(new vscode.Location(ref.uri, ref.range));
        }
        
        // Also get method definitions from the method name cache
        const methodDefinitions = this.symbolCache.findMethodsByName(methodName);
        for (const methodDef of methodDefinitions) {
            locations.push(new vscode.Location(methodDef.uri, methodDef.symbol.selectionRange));
        }
        
        console.log(`Found ${methodReferences.length} references + ${methodDefinitions.length} definitions = ${locations.length} total locations`);
        return locations;
    }

    // Search using cached symbols (faster and more accurate)
    private async searchCachedSymbols(methodName: string): Promise<vscode.Location[]> {
        const locations: vscode.Location[] = [];
        
        // First, try to find method definitions using the method name cache
        const methodDefinitions = this.symbolCache.findMethodsByName(methodName);
        
        if (methodDefinitions.length > 0) {
            // Add the definition locations
            for (const methodDef of methodDefinitions) {
                locations.push(new vscode.Location(methodDef.uri, methodDef.symbol.selectionRange));
            }
        }

        // Then search for references/calls to this method in all files
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}',
            '{**/node_modules/**,**/bin/**,**/obj/**}'
        );

        // Search through cached symbols for references
        for (const file of files) {
            try {
                const symbols = await this.symbolCache.getSymbolsForFile(file);
                this.findMethodCallsInSymbols(methodName, symbols, file, locations);
            } catch (error) {
                // If cache fails for this file, skip it
                console.warn(`Could not get cached symbols for ${file.fsPath}`);
            }
        }

        return locations;
    }

    // Recursively search for method calls in symbol tree
    private findMethodCallsInSymbols(
        methodName: string, 
        symbols: vscode.DocumentSymbol[], 
        uri: vscode.Uri, 
        locations: vscode.Location[]
    ): void {
        for (const symbol of symbols) {
            // Check if this symbol calls the method (simple name check)
            // This is a basic implementation - could be enhanced with AST parsing
            if (symbol.name.includes(methodName)) {
                locations.push(new vscode.Location(uri, symbol.selectionRange));
            }
            
            // Recursively check children
            if (symbol.children && symbol.children.length > 0) {
                this.findMethodCallsInSymbols(methodName, symbol.children, uri, locations);
            }
        }
    }

    // Fallback text-based search method
    private async searchWorkspaceByText(methodName: string): Promise<vscode.Location[]> {
        try {
            // Get all relevant files in the workspace
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}',
                '{**/node_modules/**,**/bin/**,**/obj/**}'
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

    // Method to get workspace statistics using cache
    async getWorkspaceStats(): Promise<WorkspaceStats> {
        try {
            // Get stats from cache for better performance
            const cacheStats = this.symbolCache.getCacheStats();
            
            // Also get total files for comparison
            const workspaceFiles = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}', // Common programming file extensions
                '**/node_modules/**' // Exclude node_modules
            );
            
            return {
                totalFiles: workspaceFiles.length,
                supportedFiles: cacheStats.cacheSize
            };
        } catch (error) {
            console.error('Error getting workspace stats:', error);
            return { totalFiles: 0, supportedFiles: 0 };
        }
    }
}