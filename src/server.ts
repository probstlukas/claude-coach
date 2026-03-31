/**
 * Local development server for the training plan viewer.
 * Serves the rendered HTML and provides a state API for file-based persistence.
 *
 * Usage: npx claude-coach serve plan.json [--port 3000] [--backup backup.json]
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { log } from "./lib/logging.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ServeOptions {
  planFile: string;
  port: number;
  backupFile?: string;
}

function getTemplatePath(): string {
  const locations = [
    join(__dirname, "..", "templates", "plan-viewer.html"),
    join(__dirname, "..", "..", "templates", "plan-viewer.html"),
    join(process.cwd(), "templates", "plan-viewer.html"),
  ];

  for (const loc of locations) {
    try {
      readFileSync(loc);
      return loc;
    } catch {
      // Continue
    }
  }

  throw new Error("Could not find plan-viewer.html template");
}

function getBackupPath(options: ServeOptions): string {
  if (options.backupFile) return resolve(options.backupFile);

  // Default: same directory as plan, named training-plan-backup-{date}.json
  const dir = dirname(resolve(options.planFile));
  return join(dir, `training-plan-backup.json`);
}

function renderHTML(planJson: string): string {
  const templatePath = getTemplatePath();
  let template = readFileSync(templatePath, "utf-8");

  const planDataRegex = /<script type="application\/json" id="plan-data">[\s\S]*?<\/script>/;
  const newPlanData = `<script type="application/json" id="plan-data">\n${planJson}\n</script>`;
  template = template.replace(planDataRegex, newPlanData);

  return template;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

interface BackupState {
  completed: Record<string, boolean>;
  changes: {
    moved: Record<string, string>;
    edited: Record<string, unknown>;
    deleted: string[];
    added: Record<string, unknown>;
  };
  settings: Record<string, unknown>;
  savedAt: string;
}

export function startServer(options: ServeOptions): void {
  const backupPath = getBackupPath(options);

  // Read plan JSON
  let planJson: string;
  try {
    planJson = readFileSync(resolve(options.planFile), "utf-8");
  } catch {
    log.error(`Could not read plan file: ${options.planFile}`);
    process.exit(1);
  }

  // Check for existing backup
  let backupState: BackupState | null = null;
  if (existsSync(backupPath)) {
    try {
      backupState = JSON.parse(readFileSync(backupPath, "utf-8"));
      log.info(`Loaded backup from: ${backupPath}`);
    } catch {
      log.warn(`Could not parse backup file, starting fresh`);
    }
  }

  const html = renderHTML(planJson);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for local dev
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET / — serve the viewer HTML
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // GET /api/state — load saved state
    if (req.method === "GET" && req.url === "/api/state") {
      if (backupState) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(backupState));
      } else {
        res.writeHead(204);
        res.end();
      }
      return;
    }

    // POST /api/state — save state to file
    if (req.method === "POST" && req.url === "/api/state") {
      try {
        const body = await readBody(req);
        const state: BackupState = JSON.parse(body);
        state.savedAt = new Date().toISOString();
        backupState = state;

        writeFileSync(backupPath, JSON.stringify(state, null, 2));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, savedAt: state.savedAt }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(options.port, () => {
    log.box(`Claude Coach - Training Plan Viewer`);
    log.success(`Server running at http://localhost:${options.port}`);
    log.info(`Plan: ${resolve(options.planFile)}`);
    log.info(`Backup: ${backupPath}`);
    if (backupState) {
      log.info(`Loaded backup from: ${backupState.savedAt}`);
    }
    log.ready("Open the URL above in your browser");
  });
}
