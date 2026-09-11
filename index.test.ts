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

  test("-p without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "-p"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("-p");
    expect(r.stderr).toContain("requires a value");
    expect(r.stderr).not.toContain("Unknown argument");
  });

  test("--preset without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "--preset"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--preset");
    expect(r.stderr).toContain("requires a value");
  });

  test("-o without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "-o"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("-o");
    expect(r.stderr).toContain("requires a value");
  });

  test("--output-dir without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "--output-dir"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--output-dir");
    expect(r.stderr).toContain("requires a value");
  });

  test("-t without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "-t"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("-t");
    expect(r.stderr).toContain("requires a value");
  });

  test("--timeout without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "--timeout"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--timeout");
    expect(r.stderr).toContain("requires a value");
  });

  test("--deesser without value exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "--deesser"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--deesser");
    expect(r.stderr).toContain("requires a value");
  });

  test("--set-preset without value exits with requires-a-value error", async () => {
    const r = await result(["--set-preset"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--set-preset");
    expect(r.stderr).toContain("requires a value");
  });

  test("-p with empty string exits with requires-a-value error", async () => {
    const r = await result(["recording.wav", "-p", ""]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("-p");
    expect(r.stderr).toContain("requires a value");
    expect(r.stderr).not.toContain("Unknown argument");
  });
});
