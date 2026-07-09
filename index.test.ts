import { describe, test, expect } from "bun:test";

const run = (args: string[] = [], env?: Record<string, string>) =>
  Bun.spawn(["bun", "run", "index.ts", ...args], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env, AUPHONIC_API_KEY: env?.AUPHONIC_API_KEY ?? "" },
  });

async function result(args: string[] = [], env?: Record<string, string>) {
  const proc = run(args, env);
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
    const tmpDir = `${import.meta.dir}/.test-config-${Date.now()}`;
    const r = await result(["--set-preset", "TestPreset"], { HOME: tmpDir });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Default preset set to: TestPreset");
    // Clean up
    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
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
});
