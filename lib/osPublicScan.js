import dns from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';

const MAX_HTML_BYTES = 256 * 1024;
const USER_AGENT = '1stStepPublicFirstLook/1.0 (+https://1ststep.ai/os)';

export function isPublicIpv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function parseTarget(input) {
  if (typeof input !== 'string' || input.length > 300) throw new Error('INVALID_TARGET');
  const raw = input.trim();
  if (!raw || /[\s\\]/.test(raw)) throw new Error('INVALID_TARGET');
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error('INVALID_TARGET'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(url.hostname) || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) throw new Error('INVALID_TARGET');
  url.hash = '';
  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    url.search = '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || !parts.slice(0, 2).every((part) => /^[\w.-]{1,100}$/.test(part) && part !== '.' && part !== '..')) throw new Error('INVALID_TARGET');
    const repo = parts[1].replace(/\.git$/i, '');
    if (!repo || repo === '.' || repo === '..') throw new Error('INVALID_TARGET');
    return { kind: 'github', sourceType: 'github', url: `https://github.com/${parts[0]}/${repo}`, owner: parts[0], repo };
  }
  if (url.hostname === 'apps.apple.com') {
    if (!/\/app\/(?:[^/]+\/)?id\d+\/?$/i.test(url.pathname)) throw new Error('INVALID_TARGET');
    url.search = '';
    return { kind: 'website', sourceType: 'mobile_app', url: url.toString() };
  }
  if (url.hostname === 'play.google.com') {
    const appId = url.searchParams.get('id');
    if (url.pathname !== '/store/apps/details' || !appId || !/^[a-z0-9._]{3,180}$/i.test(appId)) throw new Error('INVALID_TARGET');
    url.search = `?id=${encodeURIComponent(appId)}`;
    return { kind: 'website', sourceType: 'mobile_app', url: url.toString() };
  }
  url.search = '';
  return { kind: 'website', sourceType: 'website', url: url.toString() };
}

export function normalizeSourceType(value, target) {
  const requested = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const sourceType = requested || target.sourceType;
  if (!['website', 'web_app', 'github', 'mobile_app'].includes(sourceType)) throw new Error('INVALID_SOURCE_TYPE');
  if (sourceType === 'github' && target.kind !== 'github') throw new Error('INVALID_SOURCE_TYPE');
  if (sourceType !== 'github' && target.kind === 'github') throw new Error('INVALID_SOURCE_TYPE');
  if (sourceType === 'mobile_app' && target.sourceType !== 'mobile_app') throw new Error('INVALID_SOURCE_TYPE');
  if (sourceType !== 'mobile_app' && target.sourceType === 'mobile_app') throw new Error('INVALID_SOURCE_TYPE');
  return sourceType;
}

async function requestPinned(url, { maxBytes = MAX_HTML_BYTES, json = false } = {}) {
  const host = url.hostname;
  const addresses = await dns.lookup(host, { family: 4, all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpv4(address))) throw new Error('TARGET_UNAVAILABLE');
  const address = addresses[0].address;
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      timeout: 6500,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
      headers: { 'User-Agent': USER_AGENT, Accept: json ? 'application/vnd.github+json' : 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
    }, (response) => {
      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { request.destroy(new Error('RESPONSE_TOO_LARGE')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    const deadline = setTimeout(() => request.destroy(new Error('TARGET_TIMEOUT')), 7000);
    request.on('close', () => clearTimeout(deadline));
    request.on('timeout', () => request.destroy(new Error('TARGET_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}

function decodeText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' })[entity]).replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function extractPageEvidence(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const title = decodeText(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
  const attr = (tag, name) => {
    const match = tag?.match(new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'i'));
    return match?.[1] || match?.[2] || '';
  };
  const description = decodeText(attr(meta.find((tag) => attr(tag, 'name').toLowerCase() === 'description'), 'content'));
  const viewport = Boolean(meta.find((tag) => attr(tag, 'name').toLowerCase() === 'viewport'));
  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0], 'lang').slice(0, 30);
  const main = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const h1 = decodeText(main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  return { title, description, viewport, lang, h1 };
}

async function scanWebsite(target, sourceType = target.sourceType || 'website') {
  let url = new URL(target.url);
  let response;
  for (let hop = 0; hop < 3; hop++) {
    response = await requestPinned(url);
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (hop === 2 || !response.headers.location) throw new Error('TARGET_UNAVAILABLE');
    const next = new URL(response.headers.location, url);
    parseTarget(next.toString());
    next.search = '';
    next.hash = '';
    url = next;
  }
  if (response.status !== 200 || !/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')) throw new Error('TARGET_UNAVAILABLE');
  const evidence = extractPageEvidence(response.body);
  const checks = [
    ['Page title', evidence.title, 'Add a descriptive page title'],
    ['Meta description', evidence.description, 'Add a concise search-result description'],
    ['Main heading', evidence.h1, 'Add a clear main heading'],
    ['Language declaration', evidence.lang, 'Declare the page language'],
    ['Mobile viewport', evidence.viewport ? 'Present' : '', 'Add a mobile viewport declaration'],
  ].map(([label, value, suggestion]) => ({ label, status: value ? 'FOUND' : 'NOT FOUND IN HTML', evidence: value || 'Not present in the fetched HTML', suggestion: value ? null : suggestion }));
  const nextStep = checks.find((check) => check.suggestion)?.suggestion || 'The checked page basics are present. A deeper audit would need more evidence.';
  const source = sourceType === 'web_app' ? 'Public web app response' : sourceType === 'mobile_app' ? 'Public app-store listing' : 'Public website response';
  const note = sourceType === 'mobile_app'
    ? 'This first look inspects the public store listing only. The app binary, authenticated experience, accessibility behavior, security, privacy implementation, and performance remain unverified.'
    : sourceType === 'web_app'
      ? 'This first look inspects one public web response. Authenticated behavior, application logic, accessibility behavior, security, performance, analytics, and private systems remain unverified.'
      : 'This first look inspects one public HTML response. JavaScript-rendered content, accessibility behavior, security, performance, analytics, and private systems remain unverified.';
  return { kind: 'website', sourceType, target: target.url, inspectedUrl: url.toString(), checkedAt: new Date().toISOString(), source, checks, nextStep, note };
}

async function scanGithub(target) {
  const base = new URL(`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`);
  const response = await requestPinned(base, { json: true, maxBytes: 128 * 1024 });
  if (response.status !== 200) throw new Error(response.status === 404 ? 'PUBLIC_REPOSITORY_NOT_FOUND' : 'TARGET_UNAVAILABLE');
  let data;
  try { data = JSON.parse(response.body); } catch { throw new Error('TARGET_UNAVAILABLE'); }
  if (data.private || !data.full_name) throw new Error('PUBLIC_REPOSITORY_NOT_FOUND');
  const checks = [
    { label: 'Repository', status: 'FOUND', evidence: String(data.full_name).slice(0, 180), suggestion: null },
    { label: 'Description', status: data.description ? 'FOUND' : 'NOT SET', evidence: String(data.description || 'Not set in public repository metadata').slice(0, 180), suggestion: data.description ? null : 'Add a short repository description' },
    { label: 'License metadata', status: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION' ? 'FOUND' : 'UNKNOWN', evidence: String(data.license?.spdx_id || 'No license shown in repository metadata').slice(0, 180), suggestion: null },
    { label: 'Repository state', status: data.archived || data.disabled ? 'NEEDS REVIEW' : 'ACTIVE', evidence: data.archived ? 'Archived' : data.disabled ? 'Disabled' : 'Not archived or disabled', suggestion: data.archived || data.disabled ? 'Confirm whether this is the active project' : null },
  ];
  const nextStep = checks.find((check) => check.suggestion)?.suggestion || 'No action suggested from public metadata. A code audit would need a pinned commit and deeper evidence.';
  return { kind: 'github', sourceType: 'github', target: target.url, inspectedUrl: base.toString(), checkedAt: new Date().toISOString(), source: 'GitHub public repository metadata', checks, nextStep, note: 'This first look reads public repository metadata only. Code quality, tests, dependencies, security, release readiness, and private repositories remain unverified.' };
}

async function scanMobileApp(target) {
  const url = new URL(target.url);
  if (url.hostname === 'apps.apple.com') {
    const appId = url.pathname.match(/\/id(\d+)\/?$/i)?.[1];
    if (!appId) throw new Error('INVALID_TARGET');
    const lookupUrl = new URL(`https://itunes.apple.com/lookup?id=${appId}`);
    const response = await requestPinned(lookupUrl, { json: true, maxBytes: 256 * 1024 });
    if (response.status !== 200) throw new Error('TARGET_UNAVAILABLE');
    let data;
    try { data = JSON.parse(response.body)?.results?.[0]; } catch { throw new Error('TARGET_UNAVAILABLE'); }
    if (!data?.trackName || String(data.trackId) !== appId) throw new Error('TARGET_UNAVAILABLE');
    const checks = [
      { label: 'App listing', status: 'FOUND', evidence: String(data.trackName).slice(0, 180), suggestion: null },
      { label: 'Developer', status: data.sellerName ? 'FOUND' : 'NOT FOUND', evidence: String(data.sellerName || 'Not returned by Apple').slice(0, 180), suggestion: null },
      { label: 'Description', status: data.description ? 'FOUND' : 'NOT FOUND', evidence: data.description ? `${String(data.description).trim().slice(0, 177)}${String(data.description).trim().length > 177 ? '…' : ''}` : 'Not returned by Apple', suggestion: data.description ? null : 'Add a clear store-listing description' },
      { label: 'Current version', status: data.version ? 'FOUND' : 'UNKNOWN', evidence: String(data.version || 'Not returned by Apple').slice(0, 180), suggestion: null },
      { label: 'Last update', status: data.currentVersionReleaseDate ? 'FOUND' : 'UNKNOWN', evidence: String(data.currentVersionReleaseDate || 'Not returned by Apple').slice(0, 180), suggestion: null },
    ];
    const nextStep = checks.find((check) => check.suggestion)?.suggestion || 'The public listing basics checked here are present. A product audit needs the installed app and a defined test scope.';
    return { kind: 'website', sourceType: 'mobile_app', target: target.url, inspectedUrl: target.url, checkedAt: new Date().toISOString(), source: 'Apple App Store public listing metadata', checks, nextStep, note: 'This first look inspects Apple public listing metadata only. The app binary, authenticated experience, accessibility behavior, security, privacy implementation, and performance remain unverified.' };
  }
  return scanWebsite(target, 'mobile_app');
}

export async function scanPublicTarget(input, requestedSourceType) {
  const target = parseTarget(input);
  const sourceType = normalizeSourceType(requestedSourceType, target);
  return target.kind === 'github' ? scanGithub(target) : sourceType === 'mobile_app' ? scanMobileApp(target) : scanWebsite(target, sourceType);
}
