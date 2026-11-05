/** Reports process availability only; external integrations are not checked. */
export function GET() { return Response.json({ status: "ok", service: "cinevest-backend" }); }
