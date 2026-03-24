export class InternalServerError extends Error {
  public statusCode: number;
  public action: string;

  constructor({ cause }: { cause: string }) {
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
