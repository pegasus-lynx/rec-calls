// File 3: API controller that uses DataHandler
import { DataHandler } from './data-handler';
import { CoreService } from './core-service';

export class ApiController {
    private dataHandler: DataHandler;
    private coreService: CoreService;

    constructor() {
        this.dataHandler = new DataHandler();
        this.coreService = new CoreService();
    }

    public handleApiRequest(request: any): void {
        console.log('Handling API request');
        
        if (request.type === 'user') {
            this.dataHandler.handleUserData(request.data); // -> handleUserData -> processData
        } else if (request.type === 'system') {
            this.dataHandler.handleSystemData(request.data); // -> handleSystemData -> processData
        }
    }

    public initializeApi(): void {
        console.log('Initializing API');
        this.dataHandler.initializeHandler(); // -> initializeHandler -> setupSystem -> processData
    }

    public directProcess(data: any): void {
        console.log('Direct processing');
        this.coreService.processData(data); // Direct call to processData
    }
}