import {hashAdminPassword} from '../src/lib/admin-password.mjs';
// Read from a protected stdin stream; never pass the plaintext in CLI arguments.
let password='';
for await(const chunk of process.stdin){password+=chunk.toString('utf8');if(password.length>258)throw new Error('Password too long.');}
password=password.replace(/\r?\n$/,'');
console.log(await hashAdminPassword(password));
