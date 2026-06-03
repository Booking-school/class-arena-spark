import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const bin = {
  npm: "npm",
  npx: "npx",
};

const steps = [
  ["ESLint", bin.npx, ["eslint", ".", "--quiet"]],
  ["TypeScript", bin.npx, ["tsc", "--noEmit", "--pretty", "false"]],
  ["UX regression", "node", ["scripts/ux-regression-check.mjs"]],
];

if (process.argv.includes("--build")) {
  steps.push(["Production build", bin.npm, ["run", "build"]]);
}

function quoteArg(arg) {
  if (/^[\w./:@-]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

for (const [label, command, args] of steps) {
  console.log(`\n> ${label}`);
  const commandLine = [command, ...args].map(quoteArg).join(" ");
  const result = isWindows
    ? spawnSync(commandLine, { shell: true, stdio: "inherit" })
    : spawnSync(command, args, { shell: false, stdio: "inherit" });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nProject health check passed.");
