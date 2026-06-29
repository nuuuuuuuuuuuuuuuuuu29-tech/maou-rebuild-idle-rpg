const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { SAVE_VERSION } = require(path.join(root, ".tmp-tests", "src", "lib", "storage.js"));
const baselinePath = path.join(root, "tests", "fixtures", "balance-baseline-seed-12345-trials-10000.json");

const runSimulationJson = (args = []) =>
  execFileSync(process.execPath, ["scripts/simulate-balance.cjs", "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });

test("balance simulation script runs a lightweight JSON scenario", () => {
  const output = runSimulationJson([
    "--trials",
    "3",
    "--seed",
    "12345",
    "--scenario",
    "initial-party-ash",
    "--strategy",
    "balanced",
  ]);
  const payload = JSON.parse(output);

  assert.equal(payload.tool, "maou-rebuild-balance-simulation");
  assert.equal(payload.gameStateVersion, SAVE_VERSION);
  assert.equal(payload.trialsPerRow, 3);
  assert.equal(payload.rowCount, 1);

  const row = payload.rows[0];
  [
    "scenarioName",
    "dungeonName",
    "strategy",
    "trials",
    "successRate",
    "averageGold",
    "averageDemonLordExp",
    "averageUnitExp",
    "averageTerritoryGain",
    "rareDropRate",
    "averageRareItems",
    "incapacitationRate",
    "averageRescues",
    "averageItems",
    "trapEventRate",
    "masteryLevel",
    "traitProfile",
  ].forEach((key) => assert.ok(Object.prototype.hasOwnProperty.call(row, key), `${key} exists`));

  assert.equal(row.strategy, "balanced");
  assert.equal(row.trials, 3);
  assert.equal(typeof row.successRate, "number");
  assert.equal(typeof row.averageGold, "number");
  assert.equal(typeof row.rareDropRate, "number");
});

test("balance simulation is reproducible with the same seed", () => {
  const args = [
    "--trials",
    "4",
    "--seed",
    "777",
    "--scenario",
    "early-standard-black",
    "--strategy",
    "safe",
    "--mastery-level",
    "0",
  ];

  assert.equal(runSimulationJson(args), runSimulationJson(args));
});

test("committed balance baseline metadata matches the current save schema", () => {
  const payload = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

  assert.equal(payload.tool, "maou-rebuild-balance-simulation");
  assert.equal(payload.gameStateVersion, SAVE_VERSION);
  assert.equal(payload.seed, "12345");
  assert.equal(payload.trialsPerRow, 10000);
  assert.equal(payload.rowCount, 36);
  assert.equal(payload.rows.length, 36);
  payload.rows.forEach((row) => {
    assert.ok(row && typeof row === "object" && !Array.isArray(row));
    assert.equal(row.trials, 10000);
  });
});
