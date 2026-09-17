import test from 'node:test';
import assert from 'node:assert/strict';
import {autoMapping,slugify,revision} from '../worker/index.js';

test('auto mapping recognizes current Feishu prompt schema',()=>{
  const fields=[
    {field_name:'Subject',type:1,is_primary:true},
    {field_name:'Lang_ZH',type:1},
    {field_name:'Image Preview',type:17,field_id:'fldImage'},
    {field_name:'分类',type:3},
    {field_name:'标签',type:4},
    {field_name:'绘画工具',type:3},
    {field_name:'来源',type:15}
  ];
  assert.deepEqual(autoMapping(fields),{
    title:'Subject',cover:'Image Preview',prompt:'Lang_ZH',category:'分类',model:'绘画工具',tags:'标签',source:'来源'
  });
});

test('slugify creates stable page paths',()=>{
  assert.equal(slugify('Portrait Photo'),'portrait-photo');
  assert.equal(slugify('人像 摄影'),'人像-摄影');
});

test('revision is stable across object key order',async()=>{
  const a=await revision({b:2,a:1});
  const b=await revision({a:1,b:2});
  assert.equal(a,b);
});
