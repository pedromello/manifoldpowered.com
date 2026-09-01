export class InternalServerError extends Error {
  public statusCode: number;
  public action: string;

  constructor({
    cause,
    statusCode,
    action,
  }: {
    cause?: unknown;
    statusCode?: number;
    action?: string;
  } = {}) {
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
  public context: unknown;

  constructor({
    message,
    cause,
    action,
    context,
  }: {
    message?: string;
    cause?: unknown;
    action?: string;
    context?: unknown;
  }) {
    super(message || "Service unavailable", { cause });
    this.name = "ServiceError";
    this.action = action || "Check service availability";
    this.statusCode = 503;
    this.context = context;
  }

  toJSON() {
    return {
      message: this.message,
      name: this.name,
      action: this.action,
      status_code: this.statusCode,
      context: this.context,
    };
  }
}

export class RateLimitError extends Error {
  public statusCode: number;
  public action: string;

  constructor({
    message,
    action,
  }: {
    message?: string;
    action?: string;
  } = {}) {
    super(message || "Too many requests");
    this.name = "RateLimitError";
    this.statusCode = 429;
    this.action = action || "Try again later";
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
  public context: unknown;

  constructor({
    message,
    cause,
    action,
    context,
  }: {
    message?: string;
    cause?: unknown;
    action?: string;
    context?: unknown;
  }) {
    super(message || "Validation error", { cause });
    this.name = "ValidationError";
    this.statusCode = 400;
    this.action = action || "Check if data is valid";
    this.context = context;
  }

  toJSON() {
    return {
      message: this.message,
      name: this.name,
      action: this.action,
      status_code: this.statusCode,
      context: this.context,
    };
  }
}

export class ConflictError extends Error {
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
  } = {}) {
    super(message || "Conflict", { cause });
    this.name = "ConflictError";
    this.statusCode = 409;
    this.action = action || "Reload the resource and try again";
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

export class UnauthorizedError extends Error {
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
    super(message || "User not authenticated", { cause });
    this.name = "UnauthorizedError";
    this.statusCode = 401;
    this.action = action || "Try to log in again";
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

export class ForbiddenError extends Error {
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
    super(message || "Forbidden", { cause });
    this.name = "ForbiddenError";
    this.statusCode = 403;
    this.action = action || "Check if you have the correct feature permissions";
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

export class UnsupportedContentError extends Error {
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
    super(message || "Unsupported content", { cause });
    this.name = "UnsupportedContentError";
    this.statusCode = 422;
    this.action = action || "Choose content supported by the platform";
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

export class TooManyRequestsError extends Error {
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
    super(message || "Too many requests", { cause });
    this.name = "TooManyRequestsError";
    this.statusCode = 429;
    this.action = action || "Wait before trying again";
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
