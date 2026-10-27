export function socialError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.expose = statusCode < 500 || statusCode === 502 || statusCode === 503;
  return error;
}
