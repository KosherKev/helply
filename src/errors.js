"use strict";

class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

module.exports = { HttpError };
