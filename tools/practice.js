#!/usr/bin/env node
// Practice mode: runs Byte Runner with a pretend Claude, so you can try the app without signing in.
'use strict';
const path = require('path');
const fake = path.join(__dirname, 'fake-claude.js');
process.env.CLAUDE_PATH = process.platform === 'win32' ? `node "${fake}"` : fake;
process.env.BYTE_RUNNER_PORT = process.env.BYTE_RUNNER_PORT || '4318';
process.env.BYTE_RUNNER_PRACTICE = '1';
require('../server.js');
