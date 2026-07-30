import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessage,parseMessage,GAME_EVENTS} from '../src/schema.js';

test('creates bounded versioned messages',()=>{const message=createMessage({source:'game-arena-game',type:'score',payload:{score:10}});assert.equal(message.version,'1.0');assert.equal(message.payload.score,10);});
test('rejects personal and payment data',()=>{assert.throws(()=>createMessage({source:'game-arena-game',type:'error',payload:{email:'a@example.com'}}),/Forbidden telemetry key/);});
test('rejects unsupported versions',()=>{const parsed=parseMessage({source:'game-arena-game',version:'2.0',type:'ready',correlationId:'12345678',payload:{}},{source:'game-arena-game',events:GAME_EVENTS});assert.equal(parsed.ok,false);assert.equal(parsed.reason,'unsupported_version');});
test('rejects oversized payloads',()=>{assert.throws(()=>createMessage({source:'game-arena-game',type:'error',payload:{message:'x'.repeat(9000)}}),/8 KB/);});
