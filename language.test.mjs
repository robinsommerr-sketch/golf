import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/i18n.js', import.meta.url),'utf8');
test('Only EN and NO are available in the header, English is the first-visit default',()=>{
 assert.match(html,/<html lang="en">/);
 const flags=[...html.matchAll(/data-language="([a-z]+)"/g)].map(x=>x[1]);
 assert.deepEqual(flags,['en','no']);
 assert.match(html,/🇬🇧 EN/); assert.match(html,/🇳🇴 NO/);
 assert.match(js,/getItem\('fc_lang'\) === 'no' \? 'no' : 'en'/);
 assert.match(js,/localStorage\.setItem\('fc_lang',next\)/);
 assert.match(js,/next!==\'en\'&&next!==\'no\'/);
});
test('English UI search actions are not left in Norwegian',()=>{
 assert.equal((html.match(/type="submit">Søk<\/button>/g)||[]).length,0);
 assert.ok((html.match(/type="submit">Search<\/button>/g)||[]).length>=2);
});
