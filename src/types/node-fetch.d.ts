declare module "node-fetch" {
  export default function fetch(
    url: string | URL,
    options?: any
  ): Promise<Response>;
  export class Response {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<any>;
    text(): Promise<string>;
  }
}
