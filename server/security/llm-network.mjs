import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

function publicIp(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  if (family === 6) { const first = parseInt(address.split(':')[0] || '0', 16); return first >= 0x2000 && first <= 0x3fff; }
  return false;
}
export function assertByokUrl(baseUrl) {
  let url; try { url = new URL(baseUrl); } catch { throw new Error('LLM 地址无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || (net.isIP(url.hostname.replace(/^\[|\]$/g,'')) && !publicIp(url.hostname.replace(/^\[|\]$/g,'')))) throw new Error('个人 LLM 地址必须为公网 HTTPS 服务');
  return url;
}
export async function safeByokFetch(url, options = {}) {
  const target = assertByokUrl(url);
  return new Promise((resolve, reject) => {
    const request = https.request(target, { method: options.method || 'GET', headers: options.headers, signal: options.signal, lookup(hostname, lookupOptions, callback) {
      dns.lookup(hostname, { all: true, verbatim: true }, (error, records) => {
        if (error || !records.length || records.some(({address}) => !publicIp(address))) return callback(error || new Error('禁止访问内网地址'));
        const chosen = records[0];
        if (lookupOptions.all) callback(null, [chosen]); else callback(null, chosen.address, chosen.family);
      });
    } }, response => {
      const chunks=[]; let size=0;
      response.on('data', chunk => { size += chunk.length; if (size > 4 * 1024 * 1024) { request.destroy(new Error('响应过大')); return; } chunks.push(chunk); });
      response.on('end', () => { const status=response.statusCode; const bytes=Buffer.concat(chunks); resolve({ status, ok:status>=200 && status<300, json:async()=>JSON.parse(bytes.toString('utf8')) }); });
      response.on('error', reject);
    });
    request.on('error', reject); if (options.body) request.write(options.body); request.end();
  });
}
