import * as core from "@actions/core";
import * as github from "@actions/github";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface PullRequest {
  number: number;
  title: string;
  base: { ref: string };
  head: { ref: string };
}

interface DbConfig {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbType: "postgres" | "mysql";
}

function parseDbUrl(url: string): DbConfig {
  // Regular expression to parse the URL
  console.log("parseDbUrl:", url);
  const postgresRegex = /^postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const mysqlRegex = /^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;

  let match = url.match(postgresRegex);
  let dbType: "postgres" | "mysql" = "postgres";

  if (!match) {
    match = url.match(mysqlRegex);
    dbType = "mysql";

    if (!match) {
      throw new Error("Invalid database URL format");
    }
  }

  const [, dbUser, dbPassword, dbHost, dbPort, dbName] = match;

  const data = {
    dbUser: decodeURIComponent(dbUser),
    dbPassword: decodeURIComponent(dbPassword),
    dbHost,
    dbPort,
    dbName,
    dbType,
  };
  return data;
}

async function run(): Promise<void> {
  try {
    // Check for DOTENV_ME
    const githubToken =
      process.env.GITHUB_TOKEN ??
      core.getInput("github-token", { required: true });
    const dopplerToken =
      process.env.DOPPLER_TOKEN ??
      core.getInput("doppler-token", { required: true });
    const prNumber = process.env.PR_NUMBER; // or null

    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const repo = context.repo;

    console.log("repo:", repo);

    let currentPR: PullRequest;
    if (context.payload.pull_request) {
      currentPR = context.payload.pull_request as PullRequest;
    } else if (typeof prNumber === "string") {
      const { data: pr } = await octokit.rest.pulls.get({
        ...repo,
        pull_number: parseInt(prNumber, 10),
      });
      currentPR = pr as PullRequest;
    } else {
      core.setFailed("Could not determine pull request number. Exiting.");
      return;
    }

    console.log("currentPR:", currentPR.number);

    if (!dopplerToken) {
      core.setFailed("Doppler token is not set. Exiting.");
      return;
    }

    process.env.DOPPLER_TOKEN = dopplerToken;

    // Install PostgreSQL client (this might need to be handled differently in Mountain Dev actions)
    // For now, we'll assume it's installed or handle it separately

    // Get CI DOTENV_KEY and extract DATABASE_URL
    let databaseUrl = "";

    const command = `curl --get \
    --url 'https://api.doppler.com/v3/configs/config/secrets/download' \
    --header 'authorization: Bearer ${dopplerToken}' \
    --data-urlencode 'project=${repo.repo}' \
    --data-urlencode 'config=dev' \
    --data-urlencode 'format=env'`;
    const { stdout: decryptedOut } = await execAsync(command);

    const match = decryptedOut.match(/^DATABASE_URL=(.*)$/m);
    if (match) {
      databaseUrl = match[1].replace(/^'|'$|^"|"$/g, "");
    }

    console.log("DATABASE_URL:", databaseUrl);

    if (!databaseUrl) {
      throw new Error("Failed to extract DATABASE_URL");
    }

    // Generate database name
    const branchName =
      currentPR?.head.ref || context.ref.replace("refs/heads/", "");
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

    // Safety check for preview databases
    if (!/_preview$/.test(dbName)) {
      throw new Error(
        `Error: Attempting to drop a non-preview database (${dbName}). Database must end with _preview. Operation aborted.`
      );
    }

    console.log("Safety check pass");

    // Parse the DATABASE_URL
    const {
      dbUser,
      dbPassword,
      dbHost,
      dbPort,
      dbName: dbDatabase,
      dbType,
    } = parseDbUrl(dbName);

    console.log({
      dbName,
      dbUser,
      dbPassword,
      dbHost,
      dbPort,
      dbDatabase,
    });

    // Delete the database
    const dropCommand = `DROP DATABASE IF EXISTS ${dbDatabase}`;
    process.env.PGPASSWORD = dbPassword;
    if (dbType === "postgres") {
      await execAsync(
        `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -c "${dropCommand}"`
      );
    } else if (dbType === "mysql") {
      await execAsync(
        `mysql -h ${dbHost} -P ${dbPort} -u ${dbUser} -p${dbPassword} -e "${dropCommand}"`
      );
    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }

    console.log(`Database ${dbName} deleted (if it existed)`);
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : "An error occurred"
    );
  }
}

run();
