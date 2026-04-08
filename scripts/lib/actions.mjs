import { appendFileSync } from "fs";

/**
 * Write a key=value pair to $GITHUB_OUTPUT (no-ops locally).
 */
export function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    appendFileSync(file, `${name}=${value}\n`);
  } else {
    console.log(`[output] ${name}=${value}`);
  }
}

/**
 * Group console output in GitHub Actions step logs.
 */
export function group(name, fn) {
  if (process.env.GITHUB_ACTIONS) console.log(`::group::${name}`);
  const result = fn();
  if (process.env.GITHUB_ACTIONS) console.log("::endgroup::");
  return result;
}
