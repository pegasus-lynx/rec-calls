# Recalls - Recursive Method Call Analysis Extension

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

> **Powerful recursive method call analysis and symbol navigation for VS Code**

Recalls is a Visual Studio Code extension that provides comprehensive method call analysis, symbol caching, and recursive call tracking across your entire workspace. Whether you're debugging complex codebases, understanding method relationships, or performing code analysis, Recalls gives you the tools to navigate and understand your code structure efficiently.

## 🚀 Features

### 📊 **Comprehensive Method Analysis**
- **Recursive Method Call Tracking**: Find all methods that call a specific method, recursively up to configurable depth
- **Internal Method Call Analysis**: Discover all method calls made within a specific method
- **Cross-File Analysis**: Track method calls and references across your entire workspace
- **Smart Depth Control**: Configurable analysis depth (1-10 levels) to balance performance and thoroughness

### ⚡ **High-Performance Caching System**
- **Symbol Cache**: Lightning-fast symbol lookup with automatic indexing
- **Method Name Cache**: Direct mapping of method names to their definitions
- **Reference Cache**: Pre-built mapping of method calls to their locations
- **Smart Invalidation**: Automatic cache updates when files change
- **Background Indexing**: Non-blocking workspace analysis with progress reporting

### 🔍 **Advanced Symbol Navigation**
- **Symbol Tree View**: Hierarchical display of all symbols in the current file
- **Search & Filter**: Real-time symbol filtering with keyboard shortcuts
- **Context-Aware Navigation**: Smart method resolution based on file proximity
- **Multi-Language Support**: Works with TypeScript, JavaScript, C#, Python, Java, C++, and more

### 🎯 **Three Specialized Views**

#### 1. **Symbols View**
- Real-time symbol tree for the active file
- Search and filter functionality (`Ctrl+Shift+F`)
- Quick navigation to any symbol
- Support for methods, functions, classes, variables, and more

#### 2. **Inspect Methods View** 
- Shows what methods **call TO** a selected method
- Recursive analysis of method callers
- Cross-file caller tracking
- Configurable analysis depth

#### 3. **Internal Method Calls View**
- Shows what methods are **called FROM within** a selected method  
- Recursive analysis of internal method calls
- Method definition resolution
- Recursive call detection with warnings

### 🛠️ **Smart Analysis Features**
- **Language Extension Compatibility**: Waits for language extensions to activate before indexing
- **Built-in Method Filtering**: Excludes common built-in methods from analysis
- **Duplicate Detection**: Intelligent deduplication of method calls and references
- **Error Handling**: Robust error handling with detailed logging
- **Performance Monitoring**: Cache statistics and performance metrics

## 📦 Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Recalls"
4. Click Install

**Or install from VSIX:**
```bash
code --install-extension recalls-0.0.1.vsix
```

## 🎮 Usage

### **Getting Started**

1. **Open a Project**: Open any project with supported file types
2. **Wait for Indexing**: The extension automatically indexes your workspace symbols
3. **Explore Views**: Use the "Recursive Search" activity bar to access the three main views

### **Keyboard Shortcuts**

- `Ctrl+Alt+A` (Windows/Linux) / `Cmd+Alt+A` (Mac): Analyze method calls at cursor
- `Ctrl+Alt+I` (Windows/Linux) / `Cmd+Alt+I` (Mac): Analyze internal method calls at cursor
- `Ctrl+Shift+F`: Search symbols in current file

### **Right-Click Actions**

- **On any method/function**: "Analyze Method Calls" or "Analyze Internal Method Calls"
- **On method call results**: "Go to Method Call" or "Go to Internal Call"

### **Command Palette Commands**

- `Recalls: Analyze Method Calls` - Analyze what calls TO a method
- `Recalls: Analyze Internal Calls` - Analyze what calls FROM within a method  
- `Recalls: Set Analysis Depth` - Configure recursion depth (1-10)
- `Recalls: Show Cache Statistics` - View cache performance metrics
- `Recalls: Re-index Workspace` - Force rebuild of symbol cache
- `Recalls: Clear Analysis` - Clear all analysis results

## 🎛️ **Configuration & Settings**

### **Analysis Depth**
Control how deep the recursive analysis goes:
- **Depth 1**: Direct calls only
- **Depth 3**: Default, good balance of performance and coverage
- **Depth 10**: Maximum depth, comprehensive but slower

### **File Filtering**
The extension automatically excludes:
- `node_modules/` directories
- `bin/` and `obj/` build output folders
- Files ignored by `.gitignore` patterns (configurable)

### **Supported File Types**
- **TypeScript**: `.ts`, `.tsx`
- **JavaScript**: `.js`, `.jsx`  
- **C#**: `.cs`
- **Python**: `.py`
- **Java**: `.java`
- **C/C++**: `.c`, `.cpp`, `.h`, `.hpp`
- **And more**: `.php`, `.rb`, `.go`, `.rs`, `.kt`, `.swift`, `.dart`

## 🏗️ **Architecture**

### **Core Components**

- **Symbol Cache Manager**: High-performance caching system for workspace symbols
- **Method Analysis Service**: Recursive method call analysis engine
- **Internal Analysis Service**: Method body parsing and internal call detection
- **Tree Data Providers**: VS Code tree view implementations for each analysis type
- **Command System**: Comprehensive command and keybinding management

### **Performance Features**

- **Lazy Loading**: Symbols loaded on-demand
- **Batch Processing**: Efficient file processing in configurable batches
- **Memory Management**: Smart cache invalidation and cleanup
- **Background Operations**: Non-blocking UI with progress indicators

## 🔧 **Troubleshooting**

### **No Symbols Found**
- Ensure language extensions are installed and activated
- Check if files are supported types
- Use "Re-index Workspace" command to force refresh
- Check cache statistics for debugging info

### **Slow Performance**
- Reduce analysis depth for large codebases
- Exclude additional directories if needed
- Check cache hit rates in statistics

### **Missing Method Calls**  
- Some calls may require language-specific symbol providers
- Complex dynamic calls might not be detected
- Check console output for detailed analysis logs

## 📊 **Performance Stats**

The extension provides detailed performance metrics:

- **Files Cached**: Number of files with cached symbols
- **Total Methods**: All method definitions found
- **Method References**: All method call locations
- **Cache Hit Rate**: Symbol cache efficiency
- **Indexing Status**: Real-time indexing progress

Access via: `Command Palette → Recalls: Show Cache Statistics`

## 🔄 **What's Next**

### **Planned Major Features**

#### **🎯 Advanced Analysis**
- **Call Graph Visualization**: Interactive graph view of method call relationships
- **Dead Code Detection**: Find unused methods and unreachable code paths
- **Circular Dependency Analysis**: Detect and visualize circular method dependencies
- **Performance Hotspot Detection**: Identify methods with excessive call frequencies
- **Impact Analysis**: Show which methods are affected by changes to a specific method

#### **🌐 Enhanced Language Support**
- **AST-Based Analysis**: More accurate parsing using Abstract Syntax Trees
- **Language-Specific Features**: Tailored analysis for each programming language
- **Framework Integration**: Special handling for popular frameworks (React, Angular, Spring, etc.)
- **Cross-Language Analysis**: Track calls between different programming languages

#### **📈 Visualization & UI**
- **Interactive Call Flow Diagrams**: Visual representation of method call sequences
- **Minimap Integration**: Show method relationships in the code minimap
- **Timeline View**: Chronological view of method call chains
- **Export Capabilities**: Export analysis results to various formats (JSON, SVG, PDF)

#### **🤖 AI-Powered Features**
- **Smart Suggestions**: AI-powered recommendations for refactoring opportunities
- **Code Pattern Recognition**: Detect common design patterns and anti-patterns
- **Auto-Documentation**: Generate method documentation based on call patterns
- **Intelligent Filtering**: AI-based filtering of relevant vs irrelevant method calls

### **Planned Minor Features**

#### **🔧 Developer Experience**
- **Custom Themes**: Customizable colors and icons for different analysis types
- **Bookmark System**: Save and organize frequently analyzed methods
- **Analysis History**: Keep track of previous analysis sessions
- **Quick Actions**: One-click common operations and shortcuts
- **Workspace Templates**: Pre-configured settings for different project types

#### **📊 Advanced Statistics**
- **Method Complexity Metrics**: Cyclomatic complexity integration
- **Code Coverage Integration**: Combine with test coverage data
- **Performance Profiling**: Integration with profiling tools
- **Historical Trends**: Track changes in method call patterns over time

#### **🔌 Integration Features**
- **Git Integration**: Track method changes across commits
- **Testing Integration**: Find test methods for production methods
- **Documentation Links**: Connect methods to their documentation
- **Issue Tracking**: Link methods to bug reports and feature requests

#### **⚙️ Configuration & Customization**
- **Analysis Rules**: Custom rules for method filtering and analysis
- **Project-Specific Settings**: Per-project configuration files
- **Team Sharing**: Share analysis configurations across team members
- **Plugin System**: Allow third-party extensions to extend functionality

#### **🚀 Performance Optimizations**
- **Incremental Analysis**: Only analyze changed parts of the codebase
- **Parallel Processing**: Multi-threaded analysis for large codebases
- **Cloud Caching**: Optional cloud-based symbol caching for teams
- **Memory Optimization**: More efficient memory usage for very large projects

### **Community-Driven Features**
- **Language Contributions**: Community support for additional programming languages
- **Plugin Marketplace**: Third-party plugins and extensions
- **Configuration Sharing**: Community-shared analysis configurations
- **Use Case Templates**: Pre-built configurations for common analysis scenarios

## 🤝 **Contributing**

We welcome contributions! Please see our contributing guidelines for:

- **Bug Reports**: Help us improve by reporting issues
- **Feature Requests**: Suggest new features and enhancements  
- **Code Contributions**: Submit pull requests for fixes and features
- **Documentation**: Help improve documentation and examples
- **Testing**: Help test the extension across different environments

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- VS Code Extension API team for excellent documentation
- Language server protocol contributors
- Open source community for inspiration and feedback

---

**Happy Code Analysis! 🔍**

> For support, issues, or feature requests, please visit our [GitHub repository](https://github.com/pegasus-lynx/rec-calls).
