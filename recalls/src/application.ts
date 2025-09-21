// File 4: Application entry point that uses everything
import { ApiController } from './api-controller';
import { DataHandler } from './data-handler';
import { CoreService } from './core-service';

export class Application {
    private apiController: ApiController;
    private dataHandler: DataHandler;
    private coreService: CoreService;

    constructor() {
        this.apiController = new ApiController();
        this.dataHandler = new DataHandler();
        this.coreService = new CoreService();
    }

    public startApplication(): void {
        console.log('Starting application');
        this.apiController.initializeApi(); // Deep chain: startApplication -> initializeApi -> initializeHandler -> setupSystem -> processData
    }

    public processUserRequest(request: any): void {
        console.log('Processing user request');
        this.apiController.handleApiRequest(request); // -> handleApiRequest -> handleUserData/handleSystemData -> processData
    }

    public emergencyProcess(data: any): void {
        console.log('Emergency processing');
        this.coreService.processData(data); // Direct emergency call
    }

    public batchProcess(dataItems: any[]): void {
        console.log('Batch processing');
        dataItems.forEach(item => {
            this.dataHandler.handleUserData(item); // Multiple calls through batch processing
        });
    }
}

// Standalone functions that also call into the system
export function quickProcess(data: any): void {
    console.log('Quick process function');
    const service = new CoreService();
    service.processData(data); // External function calling processData
}

export function utilityProcess(data: any): void {
    console.log('Utility process function');
    const handler = new DataHandler();
    handler.handleUserData(data); // External function -> handleUserData -> processData
}