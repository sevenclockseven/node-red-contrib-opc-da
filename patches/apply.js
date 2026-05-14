#!/usr/bin/env node
/**
 * Postinstall script to patch node-dcom with critical bug fixes.
 * Fixes NTLM authentication issues for Node.js 18+ compatibility.
 * Fixes ComServer constructor 4-arg bug (session.getStub is not a function).
 * Fixes comobjcimpl getResultAsIntAt bug (getResultAsIntAt is not a function).
 * Adds RemActivation interface cache to bypass IRemUnknown (not supported by ABB Freelance).
 */

const fs = require('fs');
const path = require('path');

const patchSrcDir = path.join(__dirname, 'node-dcom');

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
        },
        {
            src: path.join(patchSrcDir, 'comobjcimpl.js'),
            dst: path.join(dcomRoot, 'dcom', 'core', 'comobjcimpl.js'),
            name: 'comobjcimpl.js (getResultAsIntAt fix)'
        },
        {
            src: path.join(patchSrcDir, 'frameworkhelper.js'),
            dst: path.join(dcomRoot, 'dcom', 'core', 'frameworkhelper.js'),
            name: 'frameworkhelper.js (addRef non-fatal)'
        },
        {
            src: path.join(patchSrcDir, 'RemActivation.js'),
            dst: path.join(dcomRoot, 'dcom', 'core', 'RemActivation.js'),
            name: 'RemActivation.js (cache all interfaces from activation)'
        },
        {
            src: path.join(patchSrcDir, 'remunknown.js'),
            dst: path.join(dcomRoot, 'dcom', 'core', 'remunknown.js'),
            name: 'remunknown.js (hex dump for debugging)'
        },
        {
            src: path.join(patchSrcDir, 'type1message.js'),
            dst: path.join(dcomRoot, 'dcom', 'rpc', 'security', 'messages', 'type1message.js'),
            name: 'type1message.js (fix NTLM flags operator bug + add ALWAYS_SIGN)'
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

// Try immediately, then retry up to 5 times with 1s delay
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
                console.log('node-red-contrib-opc-da: node-dcom not found after retries. Run "npm run patch" manually.');
            }
        }
    }, 1000);
} else {
    doPatch(dcomRoot);
}
