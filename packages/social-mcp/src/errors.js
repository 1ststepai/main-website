export function mcpError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function formatToolError(error) {
  const code = error?.code || "error";
  const message = error?.message || "Unexpected error.";
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, code, message }, null, 2) }],
    isError: true,
  };
}

export function formatToolResult(payload) {
  const structuredContent = {
    ok: true,
    ...(payload && typeof payload === "object" ? payload : { value: payload }),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}
