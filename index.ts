#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://auphonic.com/api";
const CONFIG_DIR = join(process.env.HOME ?? "~", ".config", "tuneup");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function loadConfig(): { preset?: string } {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: Record<string, unknown>) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

function die(msg: string, detail?: string): never {
  console.error(`Error: ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function getApiKey(): string {
  const key = process.env.AUPHONIC_API_KEY;
  if (!key) die("AUPHONIC_API_KEY environment variable is not set.");
  return key;
}

function printUsage(): never {
  console.log(`tuneup - Process audio files through Auphonic + local ffmpeg polish

Usage:
  tuneup <file> [options]

Options:
  -p, --preset <name>      Preset name (default: Usual-2 or saved default)
  -o, --output-dir <path>  Output directory (default: ~/Downloads/tuneup_results)
  -t, --timeout <seconds>  Max wait time (default: 300)
  --set-preset <name>      Set the default preset and exit
  --list-presets           List available presets
  --post-process           Run ffmpeg de-click/de-clip/de-ess on downloaded audio
  --deesser <0..1>         De-esser intensity (default: 0.2)
  -v, --version            Show version
  -h, --help               Show this help

Environment:
  AUPHONIC_API_KEY         Your Auphonic API bearer token (required)

Examples:
  tuneup recording.wav
  tuneup recording.wav -p "My Preset"
  tuneup recording.wav -o ./output`);
  process.exit(0);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const config = loadConfig();
  const opts = {
    file: "",
    preset: config.preset ?? "Usual-2",
    outputDir: `${process.env.HOME}/Downloads/tuneup_results`,
    timeout: 300,
    listPresets: false,
    postProcess: false,
    deesser: 0.2,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") printUsage();
    else if (arg === "-v" || arg === "--version") {
      const pkg = require("./package.json");
      console.log(pkg.version);
      process.exit(0);
    } else if (arg === "--set-preset" && args[i + 1]) {
      const name = args[++i];
      const config = loadConfig();
      config.preset = name;
      saveConfig(config);
      console.log(`Default preset set to: ${name}`);
      process.exit(0);
    } else if (arg === "--list-presets") opts.listPresets = true;
    else if ((arg === "-p" || arg === "--preset") && args[i + 1]) opts.preset = args[++i];
    else if ((arg === "-o" || arg === "--output-dir") && args[i + 1]) opts.outputDir = args[++i];
    else if ((arg === "-t" || arg === "--timeout") && args[i + 1]) opts.timeout = parseInt(args[++i], 10);
    else if (arg === "--post-process") opts.postProcess = true;
    else if (arg === "--deesser" && args[i + 1]) opts.deesser = parseFloat(args[++i]);
    else if (!arg.startsWith("-") && !opts.file) opts.file = arg;
    else die(`Unknown argument: ${arg}`);
  }

  return opts;
}

async function api(
  path: string,
  headers: Record<string, string>,
  init?: RequestInit
): Promise<any> {
  const resp = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (!resp.ok) {
    const text = await resp.text();
    die(`API request failed: ${path} (${resp.status})`, text);
  }
  return resp.json();
}

async function listPresets(headers: Record<string, string>) {
  const data = await api("/presets.json?minimal_data=1", headers);
  console.log("Available presets:");
  for (const p of data.data ?? []) {
    console.log(`  - ${p.preset_name}`);
  }
}

async function findPreset(name: string, headers: Record<string, string>): Promise<string> {
  const data = await api("/presets.json?minimal_data=1", headers);
  for (const p of data.data ?? []) {
    if (p.preset_name === name) return p.uuid;
  }
  console.error(`Preset "${name}" not found. Available presets:`);
  for (const p of data.data ?? []) console.error(`  - ${p.preset_name}`);
  process.exit(1);
}

async function upload(
  filePath: string,
  presetUuid: string,
  headers: Record<string, string>
): Promise<string> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) die(`File not found: ${filePath}`);

  const formData = new FormData();
  formData.append("input_file", file);
  formData.append("title", `Processed ${filePath.split("/").pop()}`);
  formData.append("preset", presetUuid);

  console.log(`Uploading: ${filePath}`);
  const resp = await fetch(`${BASE_URL}/simple/productions.json`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!resp.ok) {
    const text = await resp.text();
    die(`Upload failed (${resp.status})`, text);
  }

  const json = (await resp.json()) as any;
  const uuid = json.data?.uuid;
  if (!uuid) die("No production UUID returned from upload.");
  return uuid;
}

async function startProduction(uuid: string, headers: Record<string, string>) {
  await new Promise((r) => setTimeout(r, 2000));
  console.log("Starting production...");

  const resp = await fetch(`${BASE_URL}/production/${uuid}/start.json`, {
    method: "POST",
    headers,
  });

  if (!resp.ok) {
    const status = await api(`/production/${uuid}/status.json`, headers);
    const code = status.data?.status;
    if (![1, 2, 3].includes(code)) {
      die("Failed to start production.", await resp.text());
    }
    console.log("Production already in progress.");
  } else {
    console.log("Production started.");
  }
}

async function pollStatus(uuid: string, headers: Record<string, string>, timeout: number) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 5000));

  while (true) {
    const statusResp = await api(`/production/${uuid}/status.json`, headers);
    const code = statusResp.data?.status;
    const str = statusResp.data?.status_string;
    console.log(`Status: ${str} (${code})`);

    if (code === 3) {
      console.log("Processing complete!");
      return;
    }

    if (code === 2) {
      const details = await api(`/production/${uuid}.json`, headers);
      die(
        "Processing failed.",
        [details.data?.error_summary, details.data?.error_message, details.data?.warning_message]
          .filter(Boolean)
          .join("\n")
      );
    }

    if (Date.now() - start > timeout * 1000) {
      die(`Timed out after ${timeout}s.`, `Check manually: https://auphonic.com/engine/status/${uuid}`);
    }

    await new Promise((r) => setTimeout(r, 15000));
  }
}

async function downloadResults(uuid: string, outputDir: string, headers: Record<string, string>): Promise<string[]> {
  const { mkdirSync } = await import("fs");
  mkdirSync(outputDir, { recursive: true });

  const details = await api(`/production/${uuid}.json`, headers);
  const files = details.data?.output_files ?? [];
  const saved: string[] = [];

  for (const f of files) {
    const url = f.download_url;
    const filename = f.filename;
    if (!url || !filename) continue;

    console.log(`Downloading: ${filename}`);
    const resp = await fetch(url, { headers, redirect: "follow" });
    if (!resp.ok) die(`Download failed: ${filename} (${resp.status})`);

    const outPath = `${outputDir}/${filename}`;
    const arrayBuf = await resp.arrayBuffer();
    await Bun.write(outPath, arrayBuf);
    console.log(`Saved: ${outPath}`);
    saved.push(outPath);
  }
  return saved;
}

const AUDIO_EXTS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "aiff", "aif"]);

async function postProcess(paths: string[], deesser: number) {
  const audio = paths.filter((p) => {
    const base = p.split("/").pop() ?? p;
    if (base.includes(".cleaned.")) return false;
    const ext = base.split(".").pop()?.toLowerCase();
    return ext ? AUDIO_EXTS.has(ext) : false;
  });

  if (audio.length === 0) {
    console.log("Post-process: no audio files to clean.");
    return;
  }

  const filter = `adeclick,adeclip,deesser=i=${deesser}`;

  for (const inPath of audio) {
    const dot = inPath.lastIndexOf(".");
    const outPath = `${inPath.slice(0, dot)}.cleaned${inPath.slice(dot)}`;
    const base = inPath.split("/").pop() ?? inPath;
    const outBase = outPath.split("/").pop() ?? outPath;
    console.log(`Post-processing: ${base} -> ${outBase}`);

    const proc = Bun.spawn(
      ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", inPath, "-af", filter, outPath],
      { stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    if (code !== 0) die(`ffmpeg failed on ${base} (exit ${code}). Is ffmpeg installed?`);
    console.log(`Saved: ${outPath}`);
  }
}

// --- Main ---

const opts = parseArgs(process.argv);
const apiKey = getApiKey();
const headers = { Authorization: `Bearer ${apiKey}` };

if (opts.listPresets) {
  await listPresets(headers);
  process.exit(0);
}

if (!opts.file) printUsage();

const presetUuid = await findPreset(opts.preset, headers);
console.log(`Using preset: ${opts.preset} (${presetUuid})`);

const productionUuid = await upload(opts.file, presetUuid, headers);
console.log(`Production: ${productionUuid}`);
console.log(`Monitor: https://auphonic.com/engine/status/${productionUuid}`);

await startProduction(productionUuid, headers);
await pollStatus(productionUuid, headers, opts.timeout);
const downloaded = await downloadResults(productionUuid, opts.outputDir, headers);

if (opts.postProcess) {
  await postProcess(downloaded, opts.deesser);
}

console.log("Done!");
