import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";

async function run(): Promise<void> {
  try {
    // Check for DOTENV_ME
    const dotenvMe = process.env.DOTENV_ME;
    if (!dotenvMe) {
      throw new Error("DOTENV_ME is not set. Exiting.");
    }

    // Install dotenv-vault (assuming npm is available)
    await exec.exec("npm install -g dotenv-vault");

    // Install PostgreSQL client (this might need to be handled differently in Mountain Dev actions)
    // For now, we'll assume it's installed or handle it separately

    // Get CI DOTENV_KEY and extract DATABASE_URL
    let databaseUrl = "";
    await exec.exec("dotenv-vault keys ci", [], {
      listeners: {
        stdout: (data: Buffer) => {
          const ciKey = data.toString().trim();
          exec.exec(`dotenv-vault decrypt "${ciKey}"`, [], {
            listeners: {
              stdout: (data: Buffer) => {
                const decrypted = data.toString();
                const match = decrypted.match(/^DATABASE_URL=(.*)$/m);
                if (match) {
                  databaseUrl = match[1].replace(/^'|'$/g, "");
                }
              },
            },
          });
        },
      },
    });

    if (!databaseUrl) {
      throw new Error("Failed to extract DATABASE_URL");
    }

    // Generate database name
    const branchName =
      github.context.payload.pull_request?.head.ref ||
      github.context.ref.replace("refs/heads/", "");
    const modifiedBranchName = branchName
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();
    const dbName = databaseUrl.replace(/_[^_]*$/, `_${modifiedBranchName}`);

    // Safety check for protected databases
    if (/_(dev|staging|prod)$/.test(dbName)) {
      throw new Error(
        `Error: Attempting to drop a protected database (${dbName}). Operation aborted.`
      );
    }

    // Parse the DATABASE_URL
    const urlParts = new URL(databaseUrl);
    const dbUser = urlParts.username;
    const dbPassword = urlParts.password;
    const dbHost = urlParts.hostname;
    const dbPort = urlParts.port;
    const dbDatabase = dbName.split("/").pop()?.split("?")[0];

    // Delete the database
    const psqlCommand = `DROP DATABASE IF EXISTS ${dbDatabase}`;
    process.env.PGPASSWORD = dbPassword;

    await exec.exec("psql", [
      "-h",
      dbHost,
      "-p",
      dbPort,
      "-U",
      dbUser,
      "-c",
      psqlCommand,
    ]);

    console.log(`Database ${dbName} deleted (if it existed)`);
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : "An error occurred"
    );
  }
}

run();
