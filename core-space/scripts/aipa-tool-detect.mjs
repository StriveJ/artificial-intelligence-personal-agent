#!/usr/bin/env node
// tool detect
import { detectTool } from './lib/tool-detect.mjs';

console.log(JSON.stringify(detectTool()));
