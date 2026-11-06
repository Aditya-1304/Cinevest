/** Public failure categories shared by the World provider, persistence boundary and API route. */
export class WorldError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
