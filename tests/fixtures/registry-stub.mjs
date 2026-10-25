// Minimal npm registry stub for the pnpm policy tests. Zero dependencies, so it
// runs inside the container on loopback (compatible with the egress firewall).
// Usage: node registry-stub.mjs <port>   (spec JSON on stdin or $STUB_SPEC)
// Spec: { "<name>": { "<version>": { "ageDays": 30, "scripts": { "postinstall": "..." }, "bin": { "x": "x.mjs" }, "files": { "x.mjs": "..." } } } }
// Publish times are fully controlled via ageDays, which is the point.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const port = Number(process.argv[2]);
const spec = JSON.parse(process.env.STUB_SPEC ?? readFileSync(0, 'utf8'));
const base = `http://127.0.0.1:${port}`;
const tarballs = new Map(); // "name/version" -> Buffer

function pack(name, version, scripts, bin, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stub-pkg-'));
  mkdirSync(join(dir, 'package'));
  writeFileSync(join(dir, 'package/package.json'), JSON.stringify({ name, version, scripts, bin }));
  for (const [f, content] of Object.entries(files)) writeFileSync(join(dir, "package", f), content);
  const r = spawnSync('tar', ['-czf', '-', '-C', dir, 'package'], { maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  return r.stdout;
}

const packuments = {};
for (const [name, versions] of Object.entries(spec)) {
  const p = { name, versions: {}, time: {}, 'dist-tags': {} };
  let latest;
  for (const [version, v] of Object.entries(versions)) {
    const tgz = pack(name, version, v.scripts, v.bin, v.files);
    tarballs.set(`${name}/${version}`, tgz);
    p.versions[version] = {
      name,
      version,
      scripts: v.scripts,
      dist: {
        tarball: `${base}/${name}/-/${name}-${version}.tgz`,
        integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}`,
        shasum: createHash('sha1').update(tgz).digest('hex'),
      },
    };
    p.time[version] = new Date(Date.now() - v.ageDays * 86400e3).toISOString();
    latest = version;
  }
  p.time.created = p.time[Object.keys(versions)[0]];
  p.time.modified = p.time[latest];
  p['dist-tags'].latest = latest;
  packuments[name] = p;
}

createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]).slice(1);
  const m = path.match(/^(.+)\/-\/.+-(\d[^/]*)\.tgz$/);
  if (m && tarballs.has(`${m[1]}/${m[2]}`)) {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    return res.end(tarballs.get(`${m[1]}/${m[2]}`));
  }
  if (packuments[path]) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(packuments[path]));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"error":"not found"}');
}).listen(port, '127.0.0.1');
