import https from "node:https";
import { execFile } from "node:child_process";
import pkg from "../../package.json" with { type: "json" };

const DEFAULTS = {
  enabled: false,
  install: false,
  allowInstall: false,
  notifyIfCurrent: false,
  packageName: pkg.name,
  registryUrl: pkg.publishConfig?.registry || "https://registry.npmjs.org",
  timeoutMs: 10_000,
};
const VERSION = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function compareVersionPart(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }
  return left.localeCompare(right);
}

function compareSemver(left, right) {
  const leftParts = left.replace(/^v/i, "").split("-");
  const rightParts = right.replace(/^v/i, "").split("-");
  const leftCore = leftParts[0].split(".");
  const rightCore = rightParts[0].split(".");
  for (let index = 0; index < Math.max(leftCore.length, rightCore.length); index += 1) {
    const comparison = compareVersionPart(leftCore[index] || "0", rightCore[index] || "0");
    if (comparison !== 0) return comparison;
  }
  if (leftParts.length === 1 && rightParts.length === 1) return 0;
  if (leftParts.length === 1) return 1;
  if (rightParts.length === 1) return -1;
  return compareVersionPart(leftParts.slice(1).join("-"), rightParts.slice(1).join("-"));
}

function readUpdateConfig(config) {
  return { ...DEFAULTS, ...(config?.checkUpdate || config || {}) };
}

function registryUrl(config) {
  const base = String(config.registryUrl || "").replace(/\/+$/, "");
  const parsed = new URL(base);
  if (parsed.protocol !== "https:") throw new Error("Update registry must use HTTPS");
  return `${base}/${encodeURIComponent(config.packageName)}/latest`;
}

function fetchLatestVersion(config) {
  const url = registryUrl(config);
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { Accept: "application/json", "User-Agent": `${config.packageName}-update-check` },
      timeout: config.timeoutMs,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Update registry returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          const version = JSON.parse(body)?.version;
          if (!VERSION.test(String(version || ""))) throw new Error("Invalid version payload from registry");
          resolve(version);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Update check timed out")));
    request.on("error", reject);
  });
}

function assertSafeInstallArgs(packageName, version) {
  if (!PACKAGE_NAME.test(packageName)) throw new Error(`[update-check] Refusing to install: invalid package name "${packageName}"`);
  if (!VERSION.test(version)) throw new Error(`[update-check] Refusing to install: invalid version string "${version}" from registry`);
}

function installLatestPackage(config, version) {
  assertSafeInstallArgs(config.packageName, version);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const target = `${config.packageName}@${version}`;
  return new Promise((resolve, reject) => {
    execFile(npm, ["install", "--ignore-scripts", "--no-save", target], { cwd: process.cwd() }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve();
    });
  });
}

let inFlight = null;

export async function checkForPackageUpdate(input, logger) {
  const config = readUpdateConfig(input);
  if (!config.enabled) return null;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const currentVersion = pkg.version;
    const latestVersion = await fetchLatestVersion(config);
    if (compareSemver(latestVersion, currentVersion) <= 0) {
      if (config.notifyIfCurrent) logger?.(`You're already on the latest version (${currentVersion})`, "info");
      return { packageName: config.packageName, currentVersion, latestVersion, updateAvailable: false, installed: false };
    }

    logger?.(`Update available for ${config.packageName}: ${currentVersion} -> ${latestVersion}`, "warn");
    if (!config.install) {
      return { packageName: config.packageName, currentVersion, latestVersion, updateAvailable: true, installed: false };
    }
    if (!config.allowInstall) {
      logger?.("Automatic installation was blocked; set checkUpdate.allowInstall=true after reviewing the release.", "warn");
      return { packageName: config.packageName, currentVersion, latestVersion, updateAvailable: true, installed: false, installBlocked: true };
    }

    logger?.(`Installing ${config.packageName}@${latestVersion} with lifecycle scripts disabled`, "info");
    await installLatestPackage(config, latestVersion);
    logger?.(`Installed ${config.packageName}@${latestVersion}. Restart to apply.`, "info");
    return { packageName: config.packageName, currentVersion, latestVersion, updateAvailable: true, installed: true };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export async function runConfiguredUpdateCheck(input, logger) {
  try {
    return await checkForPackageUpdate(input, logger);
  } catch (error) {
    logger?.(`Cannot check for updates: ${error?.message || String(error)}`, "warn");
    return null;
  }
}

export default { checkForPackageUpdate, runConfiguredUpdateCheck };
