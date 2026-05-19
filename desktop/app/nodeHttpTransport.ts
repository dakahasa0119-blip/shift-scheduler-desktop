import type { DesktopApiClientTransport, DesktopApiRequestOptions, DesktopApiResponse } from "./desktopApiClient";

declare const require: (name: string) => any;
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};

const http = require("node:http");
const https = require("node:https");

export class NodeHttpTransport implements DesktopApiClientTransport {
  request(options: DesktopApiRequestOptions): Promise<DesktopApiResponse> {
    const payload = options.body === undefined ? "" : JSON.stringify(options.body);
    const url = new URL(options.path);
    const client = url.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      const request = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          method: options.method,
          headers: payload
            ? {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(payload, "utf8")),
              }
            : {},
        },
        (response: any) => {
          const chunks: string[] = [];
          response.on("data", (chunk: unknown) => chunks.push(String(chunk)));
          response.on("end", () => {
            try {
              const text = chunks.join("");
              resolve({
                statusCode: response.statusCode || 0,
                body: text ? JSON.parse(text) : null,
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on("error", reject);
      if (payload) request.write(payload);
      request.end();
    });
  }
}
