const express = require("express");
const crypto = require("crypto");
const { parseDxf, calculateCost, toCsv, toPdf } = require("./lib");
const app = express();
const PORT = Number(process.env.PORT || 3001);
const files = new Map();
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.CLIENT_ORIGIN || "http://localhost:5173",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const pub = (x) => ({
  id: x.id,
  filename: x.filename,
  size: x.size,
  uploadedAt: x.uploadedAt,
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post(
  "/api/files/upload",
  express.raw({ type: "application/octet-stream", limit: 10 * 1024 * 1024 }),
  (req, res) => {
    const filename = decodeURIComponent(
      req.get("X-Filename") || "upload.dxs",
    ).replace(/[\\/]/g, "_");
    if (!/\.(dxs|dxf)$/i.test(filename))
      return res
        .status(415)
        .json({
          error: "Only .DXS or documented .DXF interchange files are accepted.",
        });
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      return res.status(400).json({ error: "The uploaded file is empty." });
    const text = req.body.toString("utf8");
    if (text.includes("\0"))
      return res
        .status(415)
        .json({
          error:
            "Binary DXS is not supported without its manufacturer specification or SDK.",
        });
    let analysis;
    try {
      analysis = parseDxf(text);
    } catch (error) {
      return res
        .status(422)
        .json({
          error: "This file is not a supported ASCII DXF interchange file.",
          detail:
            "DXS is not one universal format. Provide a sample plus the originating machine/software, or export as ASCII DXF.",
          parserMessage: error.message,
        });
    }
    const id = crypto.randomUUID();
    const item = {
      id,
      filename,
      size: req.body.length,
      uploadedAt: new Date().toISOString(),
      analysis,
    };
    files.set(id, item);
    res.status(201).json({ file: pub(item), analysis });
  },
);
app.get("/api/files/:id/analysis", (req, res) => {
  const x = files.get(req.params.id);
  x
    ? res.json({ file: pub(x), analysis: x.analysis })
    : res.status(404).json({ error: "File not found or expired." });
});
app.get("/api/files/:id/preview", (req, res) => {
  const x = files.get(req.params.id);
  x
    ? res.json({
        bounds: x.analysis.bounds,
        entities: x.analysis.entities,
        units: x.analysis.units,
      })
    : res.status(404).json({ error: "File not found or expired." });
});
app.post("/api/files/:id/calculate", (req, res) => {
  const x = files.get(req.params.id);
  if (!x) return res.status(404).json({ error: "File not found or expired." });
  try {
    res.json(calculateCost(x.analysis, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/files/:id/report", (req, res) => {
  const x = files.get(req.params.id);
  if (!x) return res.status(404).json({ error: "File not found or expired." });
  const f = req.query.format === "pdf" ? "pdf" : "csv";
  res.type(f === "pdf" ? "application/pdf" : "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${x.filename.replace(/\.[^.]+$/, "")}-report.${f}"`,
  );
  res.send(f === "pdf" ? toPdf(x) : Buffer.from(toCsv(x)));
});
app.delete("/api/files/:id", (req, res) =>
  files.delete(req.params.id)
    ? res.sendStatus(204)
    : res.status(404).json({ error: "File not found or expired." }),
);
app.use((e, req, res, next) =>
  res
    .status(e.type === "entity.too.large" ? 413 : 500)
    .json({
      error:
        e.type === "entity.too.large"
          ? "File exceeds the 10 MB limit."
          : "Unexpected server error.",
    }),
);
const cleanup = setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, x] of files)
    if (new Date(x.uploadedAt).getTime() < cutoff) files.delete(id);
}, 600000);
cleanup.unref();
if (require.main === module)
  app.listen(PORT, () =>
    console.log(`DXS Analyzer API on http://localhost:${PORT}`),
  );
module.exports = app;
