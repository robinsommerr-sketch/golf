import assert from 'node:assert/strict';
import test from 'node:test';
import {hasBadWords,censorText,validateUsername} from '../moderation-filter.js';

test('Usernames allow normal Norwegian/English aliases, deny obvious profanity',()=>{
 assert.equal(validateUsername('Fairway_Robin'),null);
 assert.equal(validateUsername('GolfTiger123'),null);
 assert.match(validateUsername('x'),/3–18/);
 assert.match(validateUsername('Nope-Foo'),/3–18/);
 assert.match(validateUsername('Bad_FuCk'),/ikke er tillatt/);
});
test('Censorship strips and detects simple obfuscations',()=>{
 assert.equal(hasBadWords('Hei alle sammen!'),false);
 assert.equal(censorText('Hei alle sammen!').text,'Hei alle sammen!');
 for(const word of ['FUCK!','F U C K','f.u.c.k','f@en','sh1t','jævla']){
  const result=censorText('Hei '+word);
  assert.equal(result.flagged,true, word);
  assert.match(result.text,/sensurert/);
  assert.ok(!result.text.includes(word));
 }
});
