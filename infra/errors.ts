export class InternalServerError extends Error {
    public statusCode: number;
    public action: string;

    constructor({ cause }: { cause: any }) {
        super("Internal server error", { cause });
        this.name = "InternalServerError";
        this.statusCode = 500;
        this.action = "Contact support";
    }

    toJSON() {
        return {
            message: this.message,
            name: this.name,
            action: this.action,
            status_code: this.statusCode,
        };
    }
}

export class MethodNotAllowedError extends Error {
    public statusCode: number;
    public action: string;

    constructor() {
        super("Method not allowed for this endpoint");
        this.name = "MethodNotAllowedError";
        this.statusCode = 405;
        this.action = "Check if HTTP method is allowed for this endpoint";
    }

    toJSON() {
        return {
            message: this.message,
            name: this.name,
            action: this.action,
            status_code: this.statusCode,
        };
    }
}
