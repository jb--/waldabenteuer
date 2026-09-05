import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const files = (await walk("dist")).filter((f) => !f.endsWith("/sw.js"));
const digest = createHash("sha256");
digest.update(await readFile("scripts/build-sw.mjs"));
for (const f of files) digest.update(await readFile(f));
const version = digest.digest("hex").slice(0, 12);
const urls = files.map((f) => "./" + f.slice(5));
await writeFile(
  "dist/sw.js",
  `const PREFIX='waldabenteuer-'+new URL(self.registration.scope).pathname+'-';
const CACHE=PREFIX+'${version}';
const FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);}await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const saved=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});if(saved)return saved;if(event.request.mode==='navigate')return await cache.match(new URL('./index.html',self.location.href));return fetch(event.request);})());});`,
);
console.log(`Offline package ${version}: ${files.length} files`);
