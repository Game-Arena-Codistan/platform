import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createWalletTokenSeal} from '../src/lib/jazzcash-token-seal.mjs';
test('wallet encryption uses authenticated account-bound envelopes and rejects legacy plaintext/base64',()=>{
  const config={nodeEnv:'staging',jazzcashMode:'orchestrator',jazzcashTokenEncryptionKey:randomBytes(32).toString('hex')};
  const seal=createWalletTokenSeal(config),token=randomBytes(32).toString('hex'),a=seal.seal(token,'user-a'),b=seal.seal(token,'user-a');
  assert.notEqual(a,b);assert.equal(createWalletTokenSeal(config).open(a,'user-a'),token);assert.equal(seal.open(a,'user-b'),'');assert.equal(seal.open(Buffer.from(token).toString('base64url'),'user-a'),'');
  const bytes=Buffer.from(a.slice(3),'base64url');bytes[15]^=1;assert.equal(seal.open('v1.'+bytes.toString('base64url'),'user-a'),'');assert.throws(()=>createWalletTokenSeal({...config,jazzcashTokenEncryptionKey:''}));
});
