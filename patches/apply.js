#!/usr/bin/env node
/**
 * Postinstall script to patch node-dcom with critical bug fixes.
 * Fixes NTLM authentication issues for Node.js 18+ compatibility.
 * Fixes ComServer constructor 4-arg bug (session.getStub is not a function).
 */

const fs = require('fs');
const path = require('path');

// Patch sources (bundled with this package)
const patchSrcDir = path.join(__dirname, 'node-dcom');

// Possible node-dcom install locations (npm hoisting varies)
const candidateRoots = [
    path.join(__dirname, '..', 'node_modules', 'node-dcom'),
    path.join(__dirname, '..', '..', 'node_modules', 'node-dcom'),
    path.join(__dirname, '..', '..', '..', 'node_modules', 'node-dcom'),
];

function findDcomRoot() {
    for (const r of candidateRoots) {
        if (fs.existsSync(path.join(r, 'dcom', 'core', 'comserver.js'))) {
            return r;
        }
    }
    return null;
}

// Try immediately, then retry up to 5 times with 1s delay
// (handles race condition where npm hasn't finished installing deps yet)
function applyPatches() {
    let dcomRoot = findDcomRoot();

    if (!dcomRoot) {
        console.log('node-red-contrib-opc-da: node-dcom not found yet, retrying...');
        let retries = 0;
        const maxRetries = 5;
        const interval = setInterval(() => {
            retries++;
            dcomRoot = findDcomRoot();
            if (dcomRoot || retries >= maxRetries) {
                clearInterval(interval);
                if (dcomRoot) {
                    doPatch(dcomRoot);
                } else {
                    console.log('node-red-contrib-opc-da: node-dcom not found after retries. Run "npm run patch" manually after install.');
                }
            }
        }, 1000);
        return;
    }

    doPatch(dcomRoot);
}

function doPatch(dcomRoot) {
    console.log(`node-red-contrib-opc-da: Found node-dcom at ${dcomRoot}`);

    const patches = [
        {
            src: path.join(patchSrcDir, 'responses.js'),
            dst: path.join(dcomRoot, 'dcom', 'rpc', 'security', 'responses.js'),
            name: 'responses.js (NTLM auth fix)'
        },
        {
            src: path.join(patchSrcDir, 'type3message.js'),
            dst: path.join(dcomRoot, 'dcom', 'rpc', 'security', 'messages', 'type3message.js'),
            name: 'type3message.js (Type3 message fix)'
        },
        {
            src: path.join(patchSrcDir, 'comserver.js'),
            dst: path.join(dcomRoot, 'dcom', 'core', 'comserver.js'),
            name: 'comserver.js (4-arg constructor fix)'
        }
    ];

    let patched = 0;
    for (const p of patches) {
        try {
            if (fs.existsSync(p.src)) {
                if (!fs.existsSync(p.dst)) {
                    console.log(`  Skip: ${p.name} — destination not found`);
                    continue;
                }
                fs.copyFileSync(p.src, p.dst);
                patched++;
                console.log(`  Patched: ${p.name}`);
            } else {
                console.log(`  Skip: ${p.name} — source not found`);
            }
        } catch (e) {
            console.warn(`  Warning: Could not patch ${p.name}: ${e.message}`);
        }
    }

    if (patched > 0) {
        console.log(`node-red-contrib-opc-da: Applied ${patched} patch(es) to node-dcom`);
    } else {
        console.log('node-red-contrib-opc-da: No patches applied');
    }
}

applyPatches();
