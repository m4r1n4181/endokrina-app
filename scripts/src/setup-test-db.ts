import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: resolve(projectRoot, ".env") });
const testEnv = config({ path: resolve(projectRoot, ".env.test") }).parsed;
const testDatabaseUrl = testEnv?.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL is required in .env.test");
}

const testDatabase = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(testDatabase.pathname.slice(1));
testDatabase.pathname = "/postgres";

testDatabase.search = "";
const adminPool = new Pool({ connectionString: testDatabase.toString() });

try {
  const result = await adminPool.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
    [databaseName],
  );

  if (!result.rows[0]?.exists) {
    const quotedDatabaseName = `\"${databaseName.replace(/\"/g, '\"\"')}\"`;
    await adminPool.query(`CREATE DATABASE ${quotedDatabaseName}`);
    console.log(`Created test database: ${databaseName}`);
  } else {
    console.log(`Test database already exists: ${databaseName}`);
  }
} finally {
  await adminPool.end();
}

await run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
});

await run("pnpm", ["--filter", "@workspace/db", "run", "seed"], {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
});

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
    const commandLine = [executable, ...args].join(" ");
    const child = process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
          env,
          stdio: "inherit",
        })
      : spawn(executable, args, {
          env,
          stdio: "inherit",
        });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}
