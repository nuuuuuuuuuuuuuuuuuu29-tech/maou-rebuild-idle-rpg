const fs = require("node:fs");
const path = require("node:path");

const testBuildDir = path.resolve(__dirname, "..", ".tmp-tests");

fs.mkdirSync(testBuildDir, { recursive: true });
fs.writeFileSync(path.join(testBuildDir, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
