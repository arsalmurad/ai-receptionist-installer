import { verifyMediaUrl } from "@frontdesk-kit/config";

export interface WorkerEnv {
  MEDIA_GATE_SIGNING_SECRET: string;
  UPSTREAM_BASE_URL?: string;
}

/**
 * Gate in front of any client media (call recordings if ever enabled,
 * transcripts, uploaded photos). Every request must carry a valid,
 * unexpired HMAC signature - see packages/config/src/mediaGateSigning.ts.
 * With no upstream configured it just confirms the signature is valid,
 * which is enough for frontdesk verify's gate 10.
 */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (!env.MEDIA_GATE_SIGNING_SECRET) {
      return new Response(JSON.stringify({ error: "media gate not configured" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const verification = await verifyMediaUrl(
      env.MEDIA_GATE_SIGNING_SECRET,
      url.pathname,
      url.searchParams,
    );

    if (!verification.ok) {
      return new Response(JSON.stringify({ error: verification.reason }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    if (!env.UPSTREAM_BASE_URL) {
      return new Response(JSON.stringify({ ok: true, path: url.pathname }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const upstreamUrl = new URL(url.pathname, env.UPSTREAM_BASE_URL);
    const upstreamResponse = await fetch(upstreamUrl.toString());
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    });
  },
};
