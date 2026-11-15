const fs = require("fs");
const path = require("path");
const { minify } = require("terser");
const CleanCSS = require("clean-css");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const ASSETS = ["index.html", "style.css"];

if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}

for (const asset of ASSETS) {
  const src = path.join(ROOT, asset);
  const dest = path.join(DIST, asset);
  if (fs.existsSync(src)) {
    if (asset === "index.html") {
      const content = fs.readFileSync(src, "utf8").replace('src="dist/app.js"', 'src="app.js"');
      fs.writeFileSync(dest, content);
    } else {
      fs.copyFileSync(src, dest);
    }
    console.log(`[build] copied ${asset} -> dist/`);
  } else {
    console.warn(`[build] asset not found: ${asset}`);
  }
}

async function minifyFile(filePath) {
  const ext = path.extname(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  if (ext === ".js") {
    const result = await minify(content);
    fs.writeFileSync(filePath, result.code);
    console.log(`[build] minified ${path.basename(filePath)}`);
  } else if (ext === ".css") {
    const result = new CleanCSS({ level: 2 }).minify(content);
    fs.writeFileSync(filePath, result.styles);
    console.log(`[build] minified ${path.basename(filePath)}`);
  }
}

(async () => {
  const files = fs.readdirSync(DIST);
  for (const file of files) {
    if (file.endsWith(".js") || file.endsWith(".css")) {
      await minifyFile(path.join(DIST, file));
    }
  }
})();
