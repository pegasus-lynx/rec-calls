// Comprehensive test file for recursive method call analysis

export class RecursiveCallExample {
    
    // Root method that we want to analyze
    public open(): void {
        console.log('Opening...');
        this.initialize();
    }

    // Methods that call 'open'
    public openNow(): void {
        console.log('Opening now');
        this.open(); // Direct call to open
        this.validateBeforeOpen();
    }

    public openLater(): void {
        console.log('Opening later');
        setTimeout(() => {
            this.open(); // Indirect call to open
        }, 1000);
    }

    // Methods that call the callers of 'open'
    public quickStart(): void {
        console.log('Quick start');
        this.openNow(); // Calls openNow which calls open
        this.validateSystem();
    }

    public delayedStart(): void {
        console.log('Delayed start');
        this.openLater(); // Calls openLater which calls open
    }

    public autoStart(): void {
        console.log('Auto start');
        this.openNow(); // Another path to open
    }

    // Third level callers
    public launchApplication(): void {
        console.log('Launching application');
        this.quickStart(); // Calls quickStart -> openNow -> open
        this.setupEnvironment();
    }

    public startService(): void {
        console.log('Starting service');
        this.autoStart(); // Calls autoStart -> openNow -> open
    }

    public restartSystem(): void {
        console.log('Restarting system');
        this.delayedStart(); // Calls delayedStart -> openLater -> open
        this.cleanup();
    }

    // Helper methods (leaf nodes)
    private initialize(): void {
        console.log('Initializing...');
    }

    private validateBeforeOpen(): void {
        console.log('Validating before open...');
    }

    private validateSystem(): void {
        console.log('Validating system...');
    }

    private setupEnvironment(): void {
        console.log('Setting up environment...');
    }

    private cleanup(): void {
        console.log('Cleaning up...');
    }
}

// Standalone functions for testing
export function externalOpen(): void {
    console.log('External open');
    const instance = new RecursiveCallExample();
    instance.open(); // External call to open method
}

export function chainedCall(): void {
    console.log('Chained call');
    const instance = new RecursiveCallExample();
    instance.openNow(); // External call to openNow
}

export function deepChain(): void {
    console.log('Deep chain');
    const instance = new RecursiveCallExample();
    instance.launchApplication(); // Deep chain: deepChain -> launchApplication -> quickStart -> openNow -> open
}

// Another class to test cross-class calls
export class AnotherClass {
    private example: RecursiveCallExample;

    constructor() {
        this.example = new RecursiveCallExample();
    }

    public triggerOpen(): void {
        console.log('Triggering open from another class');
        this.example.open(); // Cross-class call
    }

    public triggerChain(): void {
        console.log('Triggering chain from another class');
        this.example.openNow(); // Cross-class call to a caller
    }
}