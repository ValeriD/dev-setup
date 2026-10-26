// The Base and Variant Extension Layers a Consuming Project runs, read from the image its
// devcontainer.json pins: the image ships them as /opt/dev-setup/manifests/base.json and
// <variant>.json (variants/<name>/Dockerfile). Never from this checkout, which may differ
// from what the image was built from.
//
// The image is never run and never pulled: `docker create --pull never` makes a container
// that is never started, `docker cp` copies the folder out, and `docker rm -v` removes it.
// When the image is not in the local image store the layers are "unknown".
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateManifest } from '../../../installer/src/index.mjs';
import { readJson, readJsonc } from './manifests.mjs';

export const IMAGE_MANIFESTS = '/opt/dev-setup/manifests';
export const BASE = 'Base';
export const VARIANT = 'Variant';
export const PROJECT = 'Consuming Project';

function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || r.error?.message || '').trim(), out: (r.stdout ?? '').trim() };
}

/** The `image` a project's devcontainer.json names, or null when it cannot be read. */
export function pinnedImage(project) {
  const file = join(project, '.devcontainer/devcontainer.json');
  if (!existsSync(file)) return null;
  const { value, errors } = readJsonc(file);
  return !errors.length && typeof value?.image === 'string' ? value.image : null;
}

/**
 * The image's Base and Variant layers, Base first.
 * @returns {{known: true, image: string, layers: {layer: string, variant?: string, manifest: object}[]}
 *   | {known: false, image: string|null, reason: string}}
 */
export function readImageLayers(image) {
  const unknown = (reason) => ({ known: false, image: image ?? null, reason });
  if (typeof image !== 'string' || !image) return unknown('devcontainer.json names no image');
  if (docker(['image', 'inspect', image, '--format', '{{.Id}}']).code !== 0) {
    return unknown(`${image} is not in the local image store, and the helper does not pull it (it is there once the container has been started)`);
  }
  const created = docker(['create', '--pull', 'never', '--network', 'none', image, '/never-started']);
  if (created.code !== 0) return unknown(`cannot create a container from ${image} to read its layers: ${created.err}`);
  const out = mkdtempSync(join(tmpdir(), 'dc-image-layers-'));
  try {
    const cp = docker(['cp', `${created.out}:${IMAGE_MANIFESTS}`, out]);
    if (cp.code !== 0) return unknown(`${image} has no ${IMAGE_MANIFESTS} (an image not built from this catalogue, or from before it shipped its layers): ${cp.err}`);
    const dir = join(out, 'manifests');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    if (!files.includes('base.json')) return unknown(`${image} has no ${IMAGE_MANIFESTS}/base.json`);
    const layers = [];
    for (const f of ['base.json', ...files.filter((x) => x !== 'base.json')]) {
      const { value, error } = readJson(join(dir, f));
      const problems = error ? [error] : validateManifest(value);
      if (problems.length) return unknown(`${IMAGE_MANIFESTS}/${f} in ${image} is not a valid Extension Manifest: ${problems.join('; ')}`);
      layers.push(f === 'base.json' ? { layer: BASE, manifest: value } : { layer: VARIANT, variant: f.slice(0, -'.json'.length), manifest: value });
    }
    return { known: true, image, layers };
  } finally {
    docker(['rm', '-v', created.out]);
    rmSync(out, { recursive: true, force: true });
  }
}
