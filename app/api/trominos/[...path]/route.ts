const TROMINOS_API_URL = process.env.TROMINOS_API_URL ?? 'https://api.trominos.com';
const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return Response.json({ detail: 'A Clerk bearer token is required.' }, { status: 401 });
  }
  if (!allowedMethods.has(request.method)) {
    return Response.json({ detail: 'Method not allowed.' }, { status: 405 });
  }

  const { path } = await context.params;
  if (!path.length || path[0] !== 'v1' || path.some((segment) => !segment || segment === '.' || segment === '..')) {
    return Response.json({ detail: 'Invalid Trominos API path.' }, { status: 400 });
  }

  const upstream = new URL(`/${path.map(encodeURIComponent).join('/')}`, TROMINOS_API_URL);
  upstream.search = new URL(request.url).search;
  const headers = new Headers({ Authorization: authorization, Accept: request.headers.get('accept') ?? 'application/json' });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
      redirect: 'follow',
    });
    const responseHeaders = new Headers({
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    });
    const disposition = response.headers.get('content-disposition');
    if (disposition) responseHeaders.set('Content-Disposition', disposition);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ detail: 'The Trominos API could not be reached.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
