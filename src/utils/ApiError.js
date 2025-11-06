class ApiError extends Error {
  constructor(
    statusCode,
    message = "something went wrong",
    errors = [],
    data = null,
    stack = ""
  ) {
    super(message);
    this.statusCode = statusCode || 500;

    this.data = data;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
