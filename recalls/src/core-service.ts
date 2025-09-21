// File 1: Core service that contains the method we want to analyze
export class CoreService {
    
    // This is the method we'll analyze for recursive calls
    public processData(data: any): void {
        console.log('Processing data:', data);
        this.validateData(data);
        this.transformData(data);
    }

    private validateData(data: any): void {
        console.log('Validating data');
    }

    private transformData(data: any): void {
        console.log('Transforming data');
    }

    public setupSystem(): void {
        console.log('Setting up system');
        this.processData({ type: 'system' });
    }
}