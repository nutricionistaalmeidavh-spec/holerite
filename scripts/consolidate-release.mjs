/**
 * Consolidates duplicate GitHub Release records accidentally created by
 * parallel installer, blockmap and latest.yml uploads. No application data
 * or historical releases are touched.
 *
 * Usage: GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/consolidate-release.mjs v0.3.0
 */
const [tag] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || !/^[-\w.]+\/[-\w.]+$/.test(repo ?? '') || !token) {
  throw new Error('Provide a semantic version tag, repository and GH_TOKEN.');
}
const restBase = 'https://api.github.com/repos/' + repo;
const common = {
  Authorization: 'Bearer ' + token,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};
async function api(path, options = {}) {
  const response = await fetch(restBase + path, {
    ...options,
    headers: {...common, ...(options.headers ?? {})}
  });
  if (!response.ok) throw new Error('GitHub API ' + (options.method || 'GET') + ' ' + path + ' returned ' + response.status + ': ' + (await response.text()).slice(0,300));
  if (response.status === 204) return null;
  return response.json();
}
const releases = await api('/releases?per_page=100');
const tagged = releases.filter(item => item.tag_name === tag);
const setup = 'ArtiSys-Holerites-Setup-' + tag.slice(1) + '.exe';
const expected = [setup, 'latest.yml', setup + '.blockmap'];
const canonical = tagged.find(item =>
  item.assets.some(asset => asset.name === setup && asset.state === 'uploaded') &&
  item.assets.some(asset => asset.name === 'latest.yml' && asset.state === 'uploaded')
);
if (!canonical) throw new Error('Cannot find the completed installer and latest.yml release for ' + tag);
const duplicates = tagged.filter(item => item.id !== canonical.id);
console.log('Canonical release:', canonical.id, 'duplicates:', duplicates.map(x => x.id).join(',') || 'none');

for (const duplicate of duplicates) {
  for (const asset of duplicate.assets) {
    if (canonical.assets.some(existing => existing.name === asset.name)) continue;
    if (!expected.includes(asset.name) || asset.state !== 'uploaded' || asset.size < 100) {
      throw new Error('Unexpected asset in duplicate release. Refusing to delete it: ' + asset.name);
    }
    const headers = {...common, Accept: 'application/octet-stream'};
    let download = await fetch(restBase + '/releases/assets/' + asset.id, {headers});
    let body = Buffer.from(await download.arrayBuffer());
    // GitHub can respond with metadata JSON instead of binary for some media types.
    if (!download.ok || body.byteLength !== asset.size) {
      download = await fetch(asset.browser_download_url);
      if (!download.ok) throw new Error('Download failed for '+asset.name+': '+download.status);
      body = Buffer.from(await download.arrayBuffer());
    }
    if (body.byteLength !== asset.size) throw new Error('Asset size does not match GitHub metadata: ' + asset.name);
    const target = 'https://uploads.github.com/repos/' + repo + '/releases/' + canonical.id + '/assets?name=' + encodeURIComponent(asset.name);
    const uploaded = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/octet-stream',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body
    });
    if (!uploaded.ok) throw new Error('Upload failed for ' + asset.name + ': ' + uploaded.status + ' ' + (await uploaded.text()).slice(0,300));
    const result = await uploaded.json();
    if (result.name !== asset.name || result.size !== asset.size) throw new Error('Uploaded asset verification failed: ' + asset.name);
    canonical.assets.push(result);
    console.log('Asset restored:', asset.name, result.size);
  }
  const current = await api('/releases/' + canonical.id);
  if (!expected.every(name => current.assets.some(asset => asset.name === name && asset.state === 'uploaded'))) {
    throw new Error('All assets must be present on the canonical release before removing duplicates.');
  }
  await api('/releases/' + duplicate.id, {method: 'DELETE'});
  console.log('Removed duplicate release:', duplicate.id);
}
const published = await api('/releases/tags/' + tag);
if (published.id !== canonical.id || !expected.every(name => published.assets.some(asset => asset.name === name && asset.state === 'uploaded'))) {
  throw new Error('Tag lookup is not consistent after consolidation.');
}
console.log('Verified published release:', published.html_url);
console.log('Direct setup:', published.assets.find(asset => asset.name === setup).browser_download_url);
