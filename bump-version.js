const fs = require('fs');
const path = require('path');

const basePath = __dirname;
const indexPath = path.normalize(path.join(basePath, 'index.html'));

if (!indexPath.startsWith(basePath)) {
    process.exit(1);
}

const now = new Date();
const dateStr = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now.getUTCDate().toString().padStart(2, '0')}`;
const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}${now.getUTCMinutes().toString().padStart(2, '0')}`;
const newVersion = `${dateStr}_${timeStr}`;

if (!fs.existsSync(indexPath)) {
    process.exit(1);
}

let content = fs.readFileSync(indexPath, 'utf8');

if (content.includes('BUILD_VERSION')) {
    content = content.replace(/BUILD_VERSION/g, newVersion);
    fs.writeFileSync(indexPath, content, 'utf8');
}


