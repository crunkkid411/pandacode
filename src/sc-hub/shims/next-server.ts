export class NextResponse extends Response { static json(body: unknown, init?: ResponseInit) { return new Response(JSON.stringify(body), init); } }
export type NextRequest = Request;
