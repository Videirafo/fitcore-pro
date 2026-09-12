import http from "node:http";

const port = Number(process.env.FITCORE_E2E_PROXY_PORT || 19080);
const apiTarget = new URL(process.env.FITCORE_E2E_API_TARGET || "http://127.0.0.1:18091");
const webTarget = new URL(process.env.FITCORE_E2E_WEB_TARGET || "http://127.0.0.1:13001");

function proxy(req, res, target) {
  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: target.host },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  proxy(req, res, req.url?.startsWith("/api/") ? apiTarget : webTarget);
});
server.listen(port, "127.0.0.1", () => console.log(`FitCore E2E proxy on ${port}`));
