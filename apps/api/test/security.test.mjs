import test from 'node:test';
import assert from 'node:assert/strict';
import {requestIp} from '../src/lib/security.mjs';

test('requestIp uses the proxy-appended address, not a spoofed leading value',()=>{
  const req={
    headers:{'x-forwarded-for':'198.51.100.99, 203.0.113.7'},
    socket:{remoteAddress:'10.0.0.12'}
  };
  assert.equal(requestIp(req),'203.0.113.7');
});

test('requestIp falls back to the socket address',()=>{
  const req={headers:{},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(requestIp(req),'127.0.0.1');
});

test('requestIp rejects oversized forwarded values',()=>{
  const req={
    headers:{'x-forwarded-for':`${'a'.repeat(200)}, 203.0.113.9`},
    socket:{remoteAddress:'10.0.0.12'}
  };
  assert.equal(requestIp(req),'203.0.113.9');
});
