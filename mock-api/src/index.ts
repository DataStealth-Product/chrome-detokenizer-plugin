import cors from "cors";
import express from "express";
import { z } from "zod";
import { createDefaultSource } from "./dataSource";

const app = express();
const source = createDefaultSource();
const port = Number(process.env.MOCK_API_PORT ?? 8787);

const requestSchema = z.object({
  domain: z.string().min(1),
  tokens: z.array(z.string().min(1)).max(1000)
});

app.use(express.json({ limit: "100kb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed =
        origin.startsWith("chrome-extension://") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1");

      callback(allowed ? null : new Error("origin_not_allowed"), allowed);
    }
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/detokenize", (req, res) => {
  const authorization = req.header("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    res.status(401).json({ error: "missing_or_invalid_bearer_token" });
    return;
  }

  const parsedBody = requestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request_shape" });
    return;
  }

  const requestId = req.header("x-request-id") ?? `mock-${Date.now()}`;
  const { domain, tokens } = parsedBody.data;

  // TODO: Set to true after wiring strict domain/token authorization parity with backend.
  const strictAuthzEnabled = false;
  if (strictAuthzEnabled) {
    res.status(403).json({ error: "unauthorized_domain_or_token" });
    return;
  }

  // Unknown tokens are intentionally omitted from mappings in this phase.
  const mappings = source.resolve(tokens);

  // Deliberately logs token IDs and counts only, never cleartext values.
  console.info("[mock-api] detokenize", {
    requestId,
    domain,
    requestedTokenCount: tokens.length,
    mappedTokenCount: Object.keys(mappings).length,
    timestamp: new Date().toISOString()
  });

  res.json({ mappings });
});

app.listen(port, "127.0.0.1", () => {
  console.info(`[mock-api] listening on http://127.0.0.1:${port}`);
});
