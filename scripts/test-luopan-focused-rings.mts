import assert from "node:assert/strict";
import { focusedRingIndexes, yaoLinePosition } from "../src/lib/luopan/focused-rings";
assert.deepEqual(focusedRingIndexes(0),{degree:0,hexIndex:0,hexName:"復",hexNumber:24,yaoIndex:0,yaoPosition:0,fenjinIndex:7});
assert.equal(focusedRingIndexes(180).hexName,"姤");
assert.equal(focusedRingIndexes(359.9).hexName,"復");
assert.equal(focusedRingIndexes(-.1).degree,359.9);
assert.equal(focusedRingIndexes(5.625).hexName,"頤");
assert.deepEqual(["初九","六二","九三","六四","九五","上六","用九"].map(yaoLinePosition),[0,1,2,3,4,5,-1]);
console.log("focused Luo Pan ring indexes passed: 6/6");
