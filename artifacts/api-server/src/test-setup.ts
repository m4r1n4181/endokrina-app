import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

for (const envFile of ["../../.env.test", "../../.env"]) {
	if (existsSync(envFile)) loadEnvFile(envFile);
}