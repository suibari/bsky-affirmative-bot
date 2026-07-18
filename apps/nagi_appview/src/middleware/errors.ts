import type { ErrorRequestHandler, RequestHandler } from "express";
export class ApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    message: string,
  ) {
    super(message);
  }
}
export const notFound: RequestHandler = (_req, _res, next) =>
  next(new ApiError(404, "not_found", "Endpoint not found"));
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof ApiError ? err.status : 500;
  const error = err instanceof ApiError ? err.error : "upstream_unavailable";
  if (status === 500) console.error(err);
  res
    .status(status)
    .json({ error, message: status === 500 ? "Service temporarily unavailable" : err.message });
};
