// Sample TypeScript file to test symbol extraction

export interface IUser {
    id: number;
    name: string;
    email: string;
}

export class UserService {
    private users: IUser[] = [];

    constructor(private apiUrl: string) {}

    public async getUsers(): Promise<IUser[]> {
        return this.users;
    }

    public async getUserById(id: number): Promise<IUser | undefined> {
        return this.users.find(user => user.id === id);
    }

    public async createUser(user: Omit<IUser, 'id'>): Promise<IUser> {
        const newUser: IUser = {
            ...user,
            id: Date.now()
        };
        this.users.push(newUser);
        return newUser;
    }

    private validateUser(user: IUser): boolean {
        return !!(user.name && user.email);
    }
}

export const DEFAULT_API_URL = 'https://api.example.com';

export enum UserRole {
    ADMIN = 'admin',
    USER = 'user',
    GUEST = 'guest'
}

export function createUserService(apiUrl?: string): UserService {
    return new UserService(apiUrl || DEFAULT_API_URL);
}