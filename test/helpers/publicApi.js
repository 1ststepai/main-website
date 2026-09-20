export function mockResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

export function mockJsonRequest(body, headers = {}, method = "POST") {
  return {
    method,
    body,
    headers: {
      "content-type": "application/json",
      host: "www.1ststep.ai",
      origin: "https://www.1ststep.ai",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 180) + 1}`,
      ...headers,
    },
  };
}
