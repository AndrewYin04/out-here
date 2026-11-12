/** An error a route handler turns into `{ error }` with this HTTP status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const forbidden = (m = 'forbidden') => new HttpError(403, m);
export const notFound = (m = 'not_found') => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
