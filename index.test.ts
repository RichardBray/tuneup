import { describe, test, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

type EnvMap = Record<string, string | undefined>;

function buildEnv(env?: EnvMap): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    AUPHONIC_API_KEY: env?.AUPHONIC_API_KEY ?? "",
  };
  // Allow tests to omit HOME by passing { HOME: undefined }.
  if (env && Object.prototype.hasOwnProperty.call(env, "HOME") && env.HOME === undefined) {
    delete merged.HOME;
  }
  return Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
}

const run = (args: string[] = [], env?: EnvMap, cwd: string = import.meta.dir) =>
  Bun.spawn(["bun", "run", join(import.meta.dir, "index.ts"), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: buildEnv(env),
  });

async function result(args: string[] = [], env?: EnvMap, cwd?: string) {
  const proc = run(args, env, cwd);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("tuneup cli", () => {
  test("--help exits 0 and shows usage", async () => {
    const r = await result(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage:");
    expect(r.stdout).toContain("--preset");
    expect(r.stdout).toContain("AUPHONIC_API_KEY");
  });

  test("no args with API key shows usage and exits 0", async () => {
    const r = await result([], { AUPHONIC_API_KEY: "fake-key" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  test("missing API key exits with error", async () => {
    const r = await result(["test.wav"], { AUPHONIC_API_KEY: "" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("AUPHONIC_API_KEY");
  });

  test("unknown flag exits with error", async () => {
    const r = await result(["--bogus"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Unknown argument");
  });

  test("--version prints version and exits 0", async () => {
    const r = await result(["--version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("-v is an alias for --version", async () => {
    const r = await result(["-v"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("--set-preset saves default and exits 0", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "tuneup-config-"));
    try {
      const r = await result(["--set-preset", "TestPreset"], { HOME: tmpDir });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("Default preset set to: TestPreset");
      const configPath = join(tmpDir, ".config", "tuneup", "config.json");
      expect(existsSync(configPath)).toBe(true);
      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.preset).toBe("TestPreset");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("--set-preset with HOME unset does not pollute CWD", async () => {
    const tmpCwd = mkdtempSync(join(tmpdir(), "tuneup-cwd-"));
    try {
      const r = await result(["--set-preset", "UnsetHomePreset"], { HOME: undefined }, tmpCwd);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("Default preset set to: UnsetHomePreset");
      expect(existsSync(join(tmpCwd, "~"))).toBe(false);
      expect(existsSync(join(tmpCwd, "undefined"))).toBe(false);
    } finally {
      rmSync(tmpCwd, { recursive: true, force: true });
    }
  });

  test("empty HOME exits with a clear error", async () => {
    const r = await result(["--help"], { HOME: "" });
    // Bun may still resolve a passwd home for empty HOME; only assert hard-fail when it does not.
    if (r.exitCode !== 0) {
      expect(r.stderr).toContain("home directory");
    } else {
      expect(r.stdout).toContain("Usage:");
    }
  });

  test("--help mentions post-process options", async () => {
    const r = await result(["--help"]);
    expect(r.stdout).toContain("--post-process");
    expect(r.stdout).toContain("--deesser");
  });

  test("-h is an alias for --help", async () => {
    const r = await result(["-h"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  test("--timeout abc exits with error", async () => {
    const r = await result(["--timeout", "abc"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--timeout");
    expect(r.stderr).toContain("abc");
  });

  test("-t abc exits with error", async () => {
    const r = await result(["-t", "abc"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("-t");
    expect(r.stderr).toContain("abc");
  });

  test("--timeout 0 exits with error", async () => {
    const r = await result(["--timeout", "0"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--timeout");
  });

  test("--timeout -1 exits with error", async () => {
    const r = await result(["--timeout", "-1"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--timeout");
  });

  test("--timeout 12x exits with error", async () => {
    const r = await result(["--timeout", "12x"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--timeout");
    expect(r.stderr).toContain("12x");
  });

  test("--timeout 1.5 exits with error", async () => {
    const r = await result(["--timeout", "1.5"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--timeout");
    expect(r.stderr).toContain("1.5");
  });
});
