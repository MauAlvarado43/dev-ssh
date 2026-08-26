import { readFileSync, writeFileSync } from 'node:fs';

const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error('Provide an output path for the release notes.');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n');
const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headerPattern = new RegExp(`^## \\[${escapedVersion}\\](?:[ \\t]+-[ \\t]+.*)?$`, 'm');
const headerMatch = headerPattern.exec(changelog);

if (!headerMatch || headerMatch.index === undefined) {
  throw new Error(`CHANGELOG.md must contain a ## [${packageJson.version}] section.`);
}

const sectionStart = headerMatch.index + headerMatch[0].length;
const nextSection = changelog.indexOf('\n## ', sectionStart);
const notes = changelog.slice(sectionStart, nextSection === -1 ? undefined : nextSection).trim();

if (!notes) {
  throw new Error(`The ${packageJson.version} changelog section must include release notes.`);
}

writeFileSync(outputPath, `${notes}\n`);
