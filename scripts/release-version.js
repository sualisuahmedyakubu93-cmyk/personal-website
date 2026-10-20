"use strict";

const fs = require("fs");
const path = require("path");

const packagePath = path.join(__dirname, "..", "package.json");

const releaseType = process.argv[2];

const allowedTypes = ["patch", "minor", "major"];

if (!allowedTypes.includes(releaseType)) {
console.error(
"Usage: node scripts/release-version.js <patch|minor|major>"
);
process.exit(1);
}

const packageData = JSON.parse(
fs.readFileSync(packagePath, "utf8")
);

const versionPattern = /^(0|[1-9]\d*).(0|[1-9]\d*).(0|[1-9]\d*)$/;

const match = packageData.version.match(versionPattern);

if (!match) {
console.error(
"The current package.json version is not valid Semantic Versioning:",
packageData.version
);
process.exit(1);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

if (releaseType === "major") {
major += 1;
minor = 0;
patch = 0;
} else if (releaseType === "minor") {
minor += 1;
patch = 0;
} else {
patch += 1;
}

const previousVersion = packageData.version;

packageData.version = `${major}.${minor}.${patch}`;

fs.writeFileSync(
packagePath,
JSON.stringify(packageData, null, 2) + "\n",
"utf8"
);

console.log("YASU Tech release version updated successfully.");
console.log(`Previous version: ${previousVersion}`);
console.log(`New version:      ${packageData.version}`);
console.log("");
console.log("Remember to test the application and commit the release.");
