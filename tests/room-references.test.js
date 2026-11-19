import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ROOM_TEMPLATES } from '../src/data/v2-contracts.js';
import references from '../scripts/assets/room-references-extra.json' with {type:'json'};
const sha = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
test('分类照片具备可追溯许可、原图和实际预览摘要', () => {
  assert.equal(references.length,8);
  for(const ref of references) {
    assert.ok(ref.author && ref.source.startsWith('https://www.pexels.com/photo/') && ref.licenseUrl==='https://www.pexels.com/license/');
    assert.equal(sha(ref.previewPath),ref.previewSha256,ref.key);
    if(fs.existsSync(ref.originalPath)) assert.equal(sha(ref.originalPath),ref.originalSha256,ref.key);
    assert.equal(ROOM_TEMPLATES.find(room=>room.roomType===ref.key)?.referenceImage,ref.url);
  }
  assert.ok(new Set(ROOM_TEMPLATES.map(t=>t.referenceImage)).size>=12);
});
