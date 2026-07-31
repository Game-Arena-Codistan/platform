import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicHttpsUrl,detectImage,extractDriveFileId,normalizeRemoteUrl} from '../src/remote-source.mjs';
import {cellHyperlink,gridRows} from '../src/google-sheets.mjs';

test('Google Drive links normalize to a download endpoint',()=>{
  const input='https://drive.google.com/file/d/abc123/view?usp=sharing';assert.equal(extractDriveFileId(input),'abc123');const normalized=normalizeRemoteUrl(input);assert.equal(normalized.hostname,'drive.usercontent.google.com');assert.equal(normalized.searchParams.get('id'),'abc123');
});
test('private and insecure sources are rejected',()=>{assert.throws(()=>assertPublicHttpsUrl('http://example.com/game.zip'),/HTTPS/);assert.throws(()=>assertPublicHttpsUrl('https://127.0.0.1/game.zip'),/Private IP/);assert.throws(()=>assertPublicHttpsUrl('https://service.internal/game.zip'),/Private host/);});
test('image signatures are identified without trusting extensions',()=>{assert.deepEqual(detectImage(Buffer.from([137,80,78,71,13,10,26,10])),{extension:'png',mime:'image/png'});assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).extension,'svg');});
test('rich Google Sheet links are recovered from cell metadata',()=>{const cell={formattedValue:'Link',textFormatRuns:[{startIndex:0,format:{link:{uri:'https://example.com/game.zip'}}}]};assert.equal(cellHyperlink(cell),'https://example.com/game.zip');const rows=gridRows({sheets:[{data:[{rowData:[{values:[cell]}]}]}]});assert.equal(rows[0][0].link,'https://example.com/game.zip');});
