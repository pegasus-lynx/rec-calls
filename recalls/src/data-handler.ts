// File 2: Data handler that calls CoreService
import { CoreService } from './core-service';

export class DataHandler {
    private coreService: CoreService;

    constructor() {
        this.coreService = new CoreService();
    }

    public handleUserData(userData: any): void {
        console.log('Handling user data');
        this.coreService.processData(userData); // Call to processData
    }

    public handleSystemData(systemData: any): void {
        console.log('Handling system data');
        this.coreService.processData(systemData); // Another call to processData
    }

    public initializeHandler(): void {
        console.log('Initializing handler');
        this.coreService.setupSystem(); // This calls setupSystem which calls processData
    }
}