import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the Deckhand API.
 *
 * Exists because Google's run.app edge currently 404s HTTP/1.1 requests to the
 * API's public hostname (open platform bug) while server-to-server traffic
 * routes fine. Browser calls stay same-origin (no CORS, no preflights); this
 * handler forwards them. Reads API_PROXY_TARGET per request — nothing is baked
 * at build time.
 */
export const dynamic = "force-dynamic";

const HOP_BY_HOP = ["host", "connection", "keep-alive", "transfer-encoding", "te", "upgrade"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = (process.env.API_PROXY_TARGET ?? "http://localhost:8090").replace(/\/$/, "");
  const url = `${target}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      redirect: "manual", // pass OAuth redirects through to the browser untouched
    });
  } catch (err) {
    console.error(`proxy: ${req.method} ${url} failed`, err);
    return Response.json({ detail: "API unreachable through proxy" }, { status: 502 });
  }

  const out = new Headers(upstream.headers);
  for (const h of ["content-encoding", "content-length", "transfer-encoding", "connection"]) {
    out.delete(h);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as PATCH,
  proxy as OPTIONS,
};
