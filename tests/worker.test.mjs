import test from 'node:test';import assert from 'node:assert/strict';import {revision} from '../worker/index.js';
test('revision is stable for reordered object keys',async()=>{assert.equal(await revision({b:2,a:1}),await revision({a:1,b:2}))});
