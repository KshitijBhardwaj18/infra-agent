import { HttpException } from "@nestjs/common";

/**
 * Extracts a human-readable message from any thrown value.
 * Use this wherever you catch unknown errors and need to surface a string.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === "string") return response;
    if (typeof response === "object" && response && "message" in response) {
      const msg = (response as { message: string | string[] }).message;
      return Array.isArray(msg) ? msg.join(", ") : msg;
    }
  }
  if (err instanceof Error) return err.message;
  return "unknown error";
}
