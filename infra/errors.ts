export class InternalServerError extends Error {
  public statusCode: number;
  public action: string;

  constructor({
    cause,
    statusCode,
    action,
  }: {
    cause: unknown;
    statusCode?: number;
    action?: string;
  }) {
    super("Internal server error", { cause });
    this.name = "InternalServerError";
    this.statusCode = statusCode || 500;
    this.action = action || "Contact support";
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

export class ServiceError extends Error {
  public statusCode: number;
  public action: string;

  constructor({ message, cause }: { message?: string; cause?: unknown }) {
    super(message || "Service unavailable", { cause });
    this.name = "ServiceError";
    this.statusCode = 503;
    this.action = "Check service availability";
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

export class ValidationError extends Error {
  public statusCode: number;
  public action: string;

  constructor({
    message,
    cause,
    action,
  }: {
    message?: string;
    cause?: unknown;
    action?: string;
  }) {
    super(message || "Validation error", { cause });
    this.name = "ValidationError";
    this.statusCode = 400;
    this.action = action || "Check if data is valid";
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

export class NotFoundError extends Error {
  public statusCode: number;
  public action: string;

  constructor({
    message,
    cause,
    action,
  }: {
    message?: string;
    cause?: unknown;
    action?: string;
  }) {
    super(message || "Not found", { cause });
    this.name = "NotFoundError";
    this.statusCode = 404;
    this.action = action || "Try another identifier";
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