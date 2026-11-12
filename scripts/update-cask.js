import fs from 'node:fs';
import path from 'node:path';

const [version, arm64Sha, x64Sha] = process.argv.slice(2);
if (!version) {
  console.error('Usage: node scripts/update-cask.js <version> [arm64Sha] [x64Sha]');
  process.exit(1);
}

const caskPath = path.join(process.cwd(), 'Casks', 'smith.rb');
if (!fs.existsSync(caskPath)) {
  console.error(`Cask file not found: ${caskPath}`);
  process.exit(1);
}

let content = fs.readFileSync(caskPath, 'utf8');

// Update version
content = content.replace(/version\s+"[^"]+"/, `version "${version}"`);

// Update sha256
if (arm64Sha) {
  content = content.replace(/(sha256\s+arm:\s+)"[^"]*"/, `$1"${arm64Sha}"`);
}
if (x64Sha) {
  content = content.replace(/(\n\s+intel:\s+)"[^"]*"/, `$1"${x64Sha}"`);
}

fs.writeFileSync(caskPath, content, 'utf8');
console.log(`Updated Casks/smith.rb to version ${version}`);
