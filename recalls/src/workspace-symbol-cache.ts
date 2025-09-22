import * as vscode from 'vscode';
import { CachedMethodInfo } from './types';

// Interface for cached symbol information
export interface CachedSymbolInfo {
    uri: vscode.Uri;
    symbols: vscode.DocumentSymbol[];
    lastModified: number;
    version: number;
}

// Workspace Symbol Cache Manager
export class WorkspaceSymbolCache {
    private static instance: WorkspaceSymbolCache;
    private symbolCache = new Map<string, CachedSymbolInfo>();
    private methodNameCache = new Map<string, CachedMethodInfo[]>(); // Method name to method info mapping
    private indexingInProgress = false;
    private indexingPromise: Promise<void> | null = null;
    private readonly outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Recalls Symbol Cache');
        this.initializeWorkspaceWatchers();
    }

    public static getInstance(): WorkspaceSymbolCache {
        if (!WorkspaceSymbolCache.instance) {
            WorkspaceSymbolCache.instance = new WorkspaceSymbolCache();
        }
        return WorkspaceSymbolCache.instance;
    }

    private initializeWorkspaceWatchers(): void {
        // Watch for workspace folder changes
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.log('Workspace folders changed, re-indexing...');
            this.reindexWorkspace();
        });

        // Watch for file changes
        vscode.workspace.onDidChangeTextDocument((event) => {
            this.invalidateFileCache(event.document.uri);
        });

        // Watch for file saves to update cache
        vscode.workspace.onDidSaveTextDocument((document) => {
            this.updateFileCache(document.uri);
        });

        // Watch for file creation/deletion
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}',
            false, // Don't ignore creates
            true,  // Ignore changes (handled by onDidChangeTextDocument)
            false  // Don't ignore deletes
        );

        fileWatcher.onDidCreate((uri) => {
            this.log(`File created: ${uri.fsPath}`);
            this.updateFileCache(uri);
        });

        fileWatcher.onDidDelete((uri) => {
            this.log(`File deleted: ${uri.fsPath}`);
            this.invalidateFileCache(uri);
        });
    }

    public async initializeWorkspaceIndex(): Promise<void> {
        if (this.indexingInProgress && this.indexingPromise) {
            return this.indexingPromise;
        }

        this.indexingInProgress = true;
        this.indexingPromise = this.performInitialIndexing();
        
        try {
            await this.indexingPromise;
        } finally {
            this.indexingInProgress = false;
            this.indexingPromise = null;
        }
    }

    /**
     * Wait for language extensions to be activated before indexing
     */
    private async waitForLanguageExtensions(): Promise<void> {
        this.log('Waiting for language extensions to activate...');
        
        // Wait a bit for extensions to activate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if we have any workspace files to test symbol providers
        const testFiles = await vscode.workspace.findFiles(
            '**/*.{ts,js,cs,py}', // Common language files
            '{**/node_modules/**,**/bin/**,**/obj/**}',
            5 // Just get a few test files
        );
        
        if (testFiles.length === 0) {
            this.log('No test files found, proceeding with indexing');
            return;
        }
        
        // Test symbol provider on a sample file
        let maxRetries = 10;
        let symbolsFound = false;
        
        for (let retry = 0; retry < maxRetries && !symbolsFound; retry++) {
            try {
                const testFile = testFiles[0];
                this.log(`Testing symbol provider on ${testFile.fsPath} (attempt ${retry + 1}/${maxRetries})`);
                
                const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    testFile
                );
                
                if (symbols && symbols.length > 0) {
                    symbolsFound = true;
                    this.log(`Symbol provider is ready! Found ${symbols.length} symbols in test file.`);
                } else {
                    this.log(`No symbols found in test file, waiting...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                this.log(`Error testing symbol provider (attempt ${retry + 1}): ${error}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!symbolsFound) {
            this.log('WARNING: Symbol providers may not be fully activated. Proceeding anyway...');
        }
    }

    private async performInitialIndexing(): Promise<void> {
        try {
            this.log('Starting workspace symbol indexing...');
            
            // Wait for language extensions to be activated
            await this.waitForLanguageExtensions();
            
            // Get all relevant files in the workspace
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx,py,java,cs,cpp,c,h,hpp}',
                '{**/node_modules/**,**/bin/**,**/obj/**}'
            );

            this.log(`Found ${files.length} files to index`);

            if (files.length === 0) {
                this.log('No files found to index');
                return;
            }

            // Show progress for large workspaces
            if (files.length > 50) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Indexing workspace symbols...',
                    cancellable: false
                }, async (progress) => {
                    await this.indexFiles(files, progress);
                });
            } else {
                await this.indexFiles(files);
            }

            const finalCacheSize = this.symbolCache.size;
            const methodStats = this.getMethodCacheStats();
            
            this.log(`Workspace indexing complete. Cached ${finalCacheSize} files with ${methodStats.totalMethods} methods (${methodStats.uniqueMethodNames} unique names).`);
            
            if (finalCacheSize === 0) {
                this.log('WARNING: No files were successfully indexed! This might indicate an issue with symbol providers.');
            }
        } catch (error) {
            this.log(`Error during workspace indexing: ${error}`);
            console.error('Workspace indexing error:', error);
        }
    }

    private async indexFiles(
        files: vscode.Uri[], 
        progress?: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        const batchSize = 10; // Process files in batches to avoid overwhelming VS Code
        const totalFiles = files.length;
        let successCount = 0;
        let errorCount = 0;

        this.log(`Starting to index ${totalFiles} files in batches of ${batchSize}`);

        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            
            this.log(`Processing batch ${Math.floor(i / batchSize) + 1}: files ${i + 1}-${Math.min(i + batchSize, totalFiles)}`);
            
            // Process batch in parallel
            const promises = batch.map(file => this.indexSingleFile(file));
            const results = await Promise.allSettled(promises);
            
            // Count results
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successCount++;
                } else {
                    errorCount++;
                    this.log(`Failed to index ${batch[index].fsPath}: ${result.reason}`);
                }
            });

            // Update progress
            if (progress) {
                const completed = Math.min(i + batchSize, totalFiles);
                const percentage = (completed / totalFiles) * 100;
                progress.report({
                    message: `Indexed ${completed}/${totalFiles} files (${successCount} successful, ${errorCount} failed)`,
                    increment: (batchSize / totalFiles) * 100
                });
            }

            // Small delay to prevent blocking the UI
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.log(`Indexing complete: ${successCount} successful, ${errorCount} failed, cache size: ${this.symbolCache.size}`);
    }

    private async indexSingleFile(uri: vscode.Uri): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            if (symbols) {
                const cacheKey = uri.toString();
                this.symbolCache.set(cacheKey, {
                    uri,
                    symbols,
                    lastModified: Date.now(),
                    version: document.version
                });

                // Build method name cache for this file
                this.buildMethodNameCacheForFile(uri, symbols);
                
                this.log(`Successfully indexed ${uri.fsPath} with ${symbols.length} symbols`);
            } else {
                this.log(`No symbols found for ${uri.fsPath}`);
            }
        } catch (error) {
            // Log the error for debugging but don't fail the entire indexing process
            this.log(`Could not index file ${uri.fsPath}: ${error}`);
            console.warn(`Could not index file ${uri.fsPath}:`, error);
        }
    }

    public async getSymbolsForFile(uri: vscode.Uri, forceRefresh = false): Promise<vscode.DocumentSymbol[]> {
        const cacheKey = uri.toString();
        const cached = this.symbolCache.get(cacheKey);

        // If we have cached symbols and don't need to force refresh
        if (cached && !forceRefresh) {
            try {
                const document = await vscode.workspace.openTextDocument(uri);
                // Check if document version matches cached version
                if (document.version === cached.version) {
                    this.log(`Cache hit for ${uri.fsPath}`);
                    return cached.symbols;
                }
            } catch (error) {
                // Document might not be available, return cached symbols anyway
                this.log(`Using cached symbols for ${uri.fsPath} (document not available)`);
                return cached.symbols;
            }
        }

        // Cache miss or outdated - fetch fresh symbols
        this.log(`Cache miss for ${uri.fsPath}, fetching fresh symbols`);
        await this.updateFileCache(uri);
        
        const updated = this.symbolCache.get(cacheKey);
        return updated?.symbols || [];
    }

    private async updateFileCache(uri: vscode.Uri): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            if (symbols) {
                const cacheKey = uri.toString();
                this.symbolCache.set(cacheKey, {
                    uri,
                    symbols,
                    lastModified: Date.now(),
                    version: document.version
                });

                // Build method name cache for this file
                this.buildMethodNameCacheForFile(uri, symbols);
                
                this.log(`Updated cache for ${uri.fsPath}`);
            }
        } catch (error) {
            this.log(`Failed to update cache for ${uri.fsPath}: ${error}`);
        }
    }

    private invalidateFileCache(uri: vscode.Uri): void {
        const cacheKey = uri.toString();
        if (this.symbolCache.has(cacheKey)) {
            this.symbolCache.delete(cacheKey);
            this.removeMethodsFromCache(uri); // Also remove from method cache
            this.log(`Invalidated cache for ${uri.fsPath}`);
        }
    }

    /**
     * Force reindex workspace (can be called manually if initial indexing failed)
     */
    public async forceReindexWorkspace(): Promise<void> {
        this.log('Force re-indexing workspace...');
        this.symbolCache.clear();
        this.methodNameCache.clear();
        
        // Reset indexing state
        this.indexingInProgress = false;
        this.indexingPromise = null;
        
        await this.initializeWorkspaceIndex();
    }

    public async reindexWorkspace(): Promise<void> {
        this.symbolCache.clear();
        this.methodNameCache.clear(); // Also clear method cache
        await this.initializeWorkspaceIndex();
    }

    public isIndexingInProgress(): boolean {
        return this.indexingInProgress;
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Build method name cache for a specific file
     */
    private buildMethodNameCacheForFile(uri: vscode.Uri, symbols: vscode.DocumentSymbol[]): void {
        // First, remove any existing methods from this file from the cache
        this.removeMethodsFromCache(uri);

        // Then add all methods from this file to the cache
        this.extractMethodsFromSymbols(uri, symbols);
    }

    /**
     * Remove all methods from a specific file from the method name cache
     */
    private removeMethodsFromCache(uri: vscode.Uri): void {
        const filePath = uri.toString();
        
        // Iterate through all method name entries and remove those from this file
        for (const [methodName, methodInfos] of this.methodNameCache) {
            const filteredMethods = methodInfos.filter(info => info.uri.toString() !== filePath);
            
            if (filteredMethods.length === 0) {
                // No methods left for this name, remove the entry
                this.methodNameCache.delete(methodName);
            } else {
                // Update with filtered list
                this.methodNameCache.set(methodName, filteredMethods);
            }
        }
    }

    /**
     * Extract methods from symbols and add to method name cache
     */
    private extractMethodsFromSymbols(uri: vscode.Uri, symbols: vscode.DocumentSymbol[]): void {
        for (const symbol of symbols) {
            if (this.isMethodSymbol(symbol)) {
                const methodInfo: CachedMethodInfo = {
                    methodName: symbol.name,
                    uri: uri,
                    symbol: symbol,
                    filePath: uri.fsPath
                };

                // Add to method name cache
                const existingMethods = this.methodNameCache.get(symbol.name) || [];
                existingMethods.push(methodInfo);
                this.methodNameCache.set(symbol.name, existingMethods);
            }

            // Recursively process child symbols
            if (symbol.children && symbol.children.length > 0) {
                this.extractMethodsFromSymbols(uri, symbol.children);
            }
        }
    }

    /**
     * Check if a symbol represents a method, function, or constructor
     */
    private isMethodSymbol(symbol: vscode.DocumentSymbol): boolean {
        return symbol.kind === vscode.SymbolKind.Method ||
               symbol.kind === vscode.SymbolKind.Function ||
               symbol.kind === vscode.SymbolKind.Constructor;
    }

    /**
     * Find method definitions by name using the method name cache
     */
    public findMethodsByName(methodName: string): CachedMethodInfo[] {
        return this.methodNameCache.get(methodName) || [];
    }

    /**
     * Find the best method definition for a given method name and context
     */
    public findMethodDefinition(methodName: string, contextUri?: vscode.Uri): CachedMethodInfo | null {
        const methods = this.findMethodsByName(methodName);
        
        if (methods.length === 0) {
            return null;
        }

        if (methods.length === 1) {
            return methods[0];
        }

        // If we have multiple methods with the same name, prefer:
        // 1. Methods in the same file as the context
        // 2. Methods in the same directory
        // 3. Any method (first one found)
        
        if (contextUri) {
            const contextPath = contextUri.toString();
            
            // First try: same file
            const sameFile = methods.find(method => method.uri.toString() === contextPath);
            if (sameFile) {
                return sameFile;
            }

            // Second try: same directory
            const contextDir = contextUri.fsPath.substring(0, contextUri.fsPath.lastIndexOf('/'));
            const sameDir = methods.find(method => method.filePath.startsWith(contextDir));
            if (sameDir) {
                return sameDir;
            }
        }

        // Default: return first method
        return methods[0];
    }

    /**
     * Get method name cache statistics
     */
    public getMethodCacheStats(): { totalMethods: number; uniqueMethodNames: number } {
        let totalMethods = 0;
        for (const methods of this.methodNameCache.values()) {
            totalMethods += methods.length;
        }

        return {
            totalMethods: totalMethods,
            uniqueMethodNames: this.methodNameCache.size
        };
    }

    /**
     * Clear method name cache
     */
    public clearMethodCache(): void {
        this.methodNameCache.clear();
    }

    /**
     * Update cache stats to include method cache info
     */
    public getCacheStats(): { totalFiles: number; cacheSize: number; totalMethods: number; uniqueMethodNames: number } {
        const methodStats = this.getMethodCacheStats();
        return {
            totalFiles: this.symbolCache.size,
            cacheSize: this.symbolCache.size,
            totalMethods: methodStats.totalMethods,
            uniqueMethodNames: methodStats.uniqueMethodNames
        };
    }

    public showCacheOutput(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}