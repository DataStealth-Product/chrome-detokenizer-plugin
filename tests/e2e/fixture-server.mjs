import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(currentDir, "../fixtures/token-page.html");
const humanFixturePath = path.resolve(currentDir, "../fixtures/human-test-page.html");
const iframeFixturePath = path.resolve(currentDir, "../fixtures/iframe-token-page.html");
const host = process.env.FIXTURE_HOST ?? "0.0.0.0";
const bindHealthHost = "127.0.0.1";
const preferredPort = Number(process.env.FIXTURE_PORT ?? 4173);
const strictPort = process.env.FIXTURE_STRICT_PORT === "1";
const maxPortFallbacks = 10;
const fixtureSignature = "chrome-detokenizer-fixture-v2";

const artifactCache = new Map();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${bindHealthHost}:${activePort}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: fixtureSignature,
        routes: ["/human-test.html", "/token-page.html", "/iframe-token-page.html"]
      })
    );
    return;
  }

  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/human-test.html") {
    const html = await readFile(humanFixturePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (url.pathname === "/token-page.html") {
    const html = await readFile(fixturePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (url.pathname === "/iframe-token-page.html") {
    const html = await readFile(iframeFixturePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (url.pathname.startsWith("/downloads/")) {
    const fileName = url.pathname.split("/").pop() ?? "";
    const artifact = await getArtifact(fileName);
    if (!artifact) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": artifact.contentType,
      "Content-Disposition": `attachment; filename="${artifact.fileName}"`
    });
    res.end(Buffer.from(artifact.bytes));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

let activePort = preferredPort;
await start();

async function start() {
  for (let attempt = 0; attempt <= maxPortFallbacks; attempt += 1) {
    const candidatePort = preferredPort + attempt;
    activePort = candidatePort;

    const outcome = await tryListen(candidatePort);
    if (outcome === "listening") {
      logListening(candidatePort);
      return;
    }

    if (outcome === "reused") {
      logReused(candidatePort);
      holdProcessOpen();
      return;
    }

    if (strictPort) {
      throw new Error(`fixture_port_unavailable:${candidatePort}`);
    }
  }

  throw new Error(`fixture_port_unavailable:${preferredPort}`);
}

function tryListen(port) {
  return new Promise((resolve, reject) => {
    const onError = async (error) => {
      server.off("listening", onListening);

      if (error?.code !== "EADDRINUSE") {
        reject(error);
        return;
      }

      const reused = await checkHealthyFixture(port);
      if (reused) {
        server.off("error", onError);
        resolve("reused");
        return;
      }

      server.off("error", onError);
      resolve("conflict");
    };

    const onListening = () => {
      server.off("error", onError);
      resolve("listening");
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function checkHealthyFixture(port) {
  try {
    const response = await fetch(`http://${bindHealthHost}:${port}/health`);
    if (!response.ok) {
      return false;
    }

    const body = await response.json();
    return body?.ok === true && body?.service === fixtureSignature && Array.isArray(body?.routes) && body.routes.includes("/human-test.html");
  } catch {
    return false;
  }
}

function logListening(port) {
  console.info(`[fixture-server] listening on http://${host === "0.0.0.0" ? bindHealthHost : host}:${port}`);
  console.info(`[fixture-server] human fixture: http://${host === "0.0.0.0" ? bindHealthHost : host}:${port}/human-test.html`);
  if (host === "0.0.0.0") {
    console.info(`[fixture-server] bound to all interfaces for browser access outside the container`);
  }
}

function logReused(port) {
  console.info(`[fixture-server] reusing existing fixture server on http://${bindHealthHost}:${port}`);
  console.info(`[fixture-server] human fixture: http://${bindHealthHost}:${port}/human-test.html`);
}

function holdProcessOpen() {
  const interval = setInterval(() => undefined, 60_000);
  const cleanup = () => {
    clearInterval(interval);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function getArtifact(fileName) {
  if (artifactCache.has(fileName)) {
    return artifactCache.get(fileName);
  }

  const artifact = await buildArtifact(fileName);
  if (artifact) {
    artifactCache.set(fileName, artifact);
  }
  return artifact;
}

async function buildArtifact(fileName) {
  switch (fileName) {
    case "sample.txt":
      return {
        fileName,
        contentType: "text/plain; charset=utf-8",
        bytes: new TextEncoder().encode("TXT token: [<TOKEN-Name-J>] and [<TOKEN-Name-X>]")
      };
    case "sample.json":
      return {
        fileName,
        contentType: "application/json",
        bytes: new TextEncoder().encode(
          JSON.stringify(
            {
              employee: "[<TOKEN-Name-M>]",
              nested: {
                director: "[<TOKEN-Name-E>]"
              }
            },
            null,
            2
          )
        )
      };
    case "sample.pdf":
      return {
        fileName,
        contentType: "application/pdf",
        bytes: await buildSamplePdf()
      };
    case "sample.docx":
      return {
        fileName,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: await buildSampleDocx()
      };
    case "sample.xlsx":
      return {
        fileName,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: await buildSampleXlsx()
      };
    case "sample.pptx":
      return {
        fileName,
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        bytes: await buildSamplePptx()
      };
    default:
      return null;
  }
}

async function buildSamplePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("PDF token: [<TOKEN-Name-J>]", { x: 48, y: 720, size: 20, font });
  page.drawText("PDF token: [<TOKEN-Name-M>]", { x: 48, y: 680, size: 20, font });
  page.drawText("Unknown token: [<TOKEN-Name-X>]", { x: 48, y: 640, size: 20, font });
  return await pdf.save();
}

async function buildSampleDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>DOCX token: [&lt;TOKEN-Name-J&gt;]</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>[&lt;TOKEN-</w:t></w:r>
      <w:r><w:t>Name-D&gt;]</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildSampleXlsx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Fixture" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c></row>
    <row r="2"><c r="A2" t="s"><v>1</v></c></row>
  </sheetData>
</worksheet>`
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>XLSX token: [&lt;TOKEN-Name-M&gt;]</t></si>
  <si><r><t>[&lt;TOKEN-</t></r><r><t>Name-E&gt;]</t></r></si>
</sst>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildSamplePptx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>PPTX token: [&lt;TOKEN-Name-JM&gt;]</a:t></a:r></a:p>
          <a:p><a:r><a:t>[&lt;TOKEN-</a:t></a:r><a:r><a:t>Name-D&gt;]</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
  );
  return zip.generateAsync({ type: "uint8array" });
}
