# node-red-contrib-opc-da 改造交接文档

> 最后更新: 2026-05-14
> 仓库: https://github.com/sevenclockseven/node-red-contrib-opc-da
> 原版: https://github.com/st-one-io/node-red-contrib-opc-da (v1.0.3)

---

## 一、项目背景

将 node-red-contrib-opc-da 改造为支持 ABB Freelance 2000 OPC Server 的可用版本。

### 运行环境
- **Node-RED**: Docker 部署，Node.js 24
- **OPC-DA 服务器**: ABB Freelance 2000
  - CLSID: `F822DE8F-207C-11D1-BAD4-006097385031`
  - ProgId: `Freelance2000OPCServer.31.1`（版本号可能不同）
- **对照组**: WinCC OPC-DA（可正常连接）

---

## 二、依赖链

```
node-red-contrib-opc-da (v2.0.0)
  └── node-opc-da ^1.0.7
        └── node-dcom ^1.0.9   ← 大部分 bug 在这里
```

---

## 三、已修复的 Bug（共 14 个）

### 3.1 NTLM 认证 bug（node-dcom/dcom/rpc/security/responses.js）
| # | Bug | 修复 |
|---|---|---|
| 1 | `lmHash.concat(lowHash)` 不修改原数组 | `lmHash = lmHash.concat(lowHash)` |
| 2 | `lmHash.concat(highHash)` 同上 | 同上 |
| 3 | `lmv2Response.concat(mac)` 同上 | 同上 |
| 4 | `aux.lenght` 拼写错误 | `aux.length` |
| 5 | `(time >> 0) && 0xff` 逻辑与 vs 位与 | `& 0xff` |
| 6 | HMAC 同一实例两次 update（Node.js 18+ 不可复用） | 拆成两个独立 HMAC 实例 |
| 7 | `lmHash` 里 `'ded-ecb'` 拼写错误 | `'des-ecb'` |
| 8 | DES cipher IV 传空字符串 `''` | `Buffer.alloc(0)` |

### 3.2 Type3 消息 bug（node-dcom/dcom/rpc/security/messages/type3message.js）
| # | Bug | 修复 |
|---|---|---|
| 9 | `this.readSecurityBuffer(material, post)` 应为 `pos` | 改为 `pos` |

### 3.3 ComServer 构造函数 bug（node-dcom/dcom/core/comserver.js）
| # | Bug | 修复 |
|---|---|---|
| 10 | `arguments.length == 3` 不匹配 4 参数调用 | 改为 `>= 3` |

### 3.4 comobjcimpl.js bug（node-dcom/dcom/core/comobjcimpl.js）
| # | Bug | 修复 |
|---|---|---|
| 11 | `obj.getResultAsIntAt(1)` 方法不存在 | 改为 `obj.getResultAt(1).getValue()` |

### 3.5 addRef 容错（comserver.js + frameworkhelper.js）
- ABB Freelance 在 `addRef` 调用时返回 `E_ACCESSDENIED` (0x80070005)
- 已将所有 `addRef()` 调用包裹 try-catch，失败时 log 但继续执行
- WinCC 不受影响（其 addRef 能成功）

### 3.6 NTLMv2 支持（red/opc-da.js）
- Session 创建后设置 `session.useNTLMv2 = true`（注意：不能用 `session.useNTLMv2(true)`，因为方法名与属性名冲突，构造函数里 `this.useNTLMv2 = false` 会覆盖方法）

### 3.7 NTLM Type1 消息 flags 运算符优先级 bug（type1message.js）
| # | Bug | 修复 |
|---|---|---|
| 12 | `getDefaultFlags()` 中 `|` 优先级高于 `?:`，导致 flags 永远只返回 `0x01`（UNICODE），NTLM 和 VERSION 标志全丢 | 改为变量 + if/else |
| 13 | 构造函数中无显式 flags 时，`getDefaultFlags()` 返回值被丢弃，flags 从未被设置 | 改为 `setFlags(defaultFlags)` |

### 3.8 isDual 误判（RemActivation.js）
| # | Bug | 修复 |
|---|---|---|
| 14 | 激活返回的第 2 个接口如果不是 IDispatch 但仍被标记为 `isDual=true`，导致 `releaseRef` 用错误的 IPID 调用 | 检查第二个接口的 IID 是否为 `00020400-...`（IDispatch），不是则不设 isDual |

### 3.9 激活接口缓存（RemActivation.js + comserver.js）
- 激活时请求所有 OPC DA 接口（IOPCServer, IOPCBrowseServerAddressSpace, IOPCCommon, IOPCItemProperties 等）
- 返回的接口指针按 IID 存入 `Map<String, InterfacePointer>` 缓存
- `ComServer.getInterface()` 先查缓存，命中则直接创建 ComObjectImpl，绕过 IRemUnknown

### 3.10 IRemUnknown 走主连接（comserver.js）
- 原代码通过 stub2（RemUnknownServer）调用 IRemUnknown，会创建**新 TCP 连接**，ABB Freelance 拒绝来自新连接的 IRemUnknown 请求（返回 E_ACCESSDENIED）
- 改为通过 ComServer **已有的主连接**临时切换 syntax 到 IRemUnknown 发送请求

### 3.11 OpenSSL 3.0 兼容
- Node.js 18+ 的 OpenSSL 3.0 默认禁用 MD4 和 DES-ECB
- **必须**设置环境变量：`NODE_OPTIONS=--openssl-legacy-provider`
- 这不是代码能修的问题，必须靠环境变量

---

## 四、补丁机制

### 4.1 补丁文件列表（patches/node-dcom/）
| 文件 | 目标路径 | 作用 |
|---|---|---|
| responses.js | dcom/rpc/security/responses.js | NTLM 认证修复 |
| type3message.js | dcom/rpc/security/messages/type3message.js | Type3 消息修复 |
| comserver.js | dcom/core/comserver.js | 4 参数构造函数 + addRef 容错 |
| comobjcimpl.js | dcom/core/comobjcimpl.js | getResultAsIntAt 修复 |
| frameworkhelper.js | dcom/core/frameworkhelper.js | addRef 容错 |

### 4.2 安装方式
```bash
npm install sevenclockseven/node-red-contrib-opc-da
# postinstall 自动打补丁，如果没生效：
npm run patch
```

### 4.3 Docker 环境手动打补丁
```bash
# 进容器
docker exec -it <容器名> bash

# 确认 node-dcom 已安装
ls /data/node_modules/node-dcom/dcom/core/comserver.js

# 手动复制所有补丁
cp /data/node_modules/node-red-contrib-opc-da/patches/node-dcom/responses.js /data/node_modules/node-dcom/dcom/rpc/security/
cp /data/node_modules/node-red-contrib-opc-da/patches/node-dcom/type3message.js /data/node_modules/node-dcom/dcom/rpc/security/messages/
cp /data/node_modules/node-red-contrib-opc-da/patches/node-dcom/comserver.js /data/node_modules/node-dcom/dcom/core/
cp /data/node_modules/node-red-contrib-opc-da/patches/node-dcom/comobjcimpl.js /data/node_modules/node-dcom/dcom/core/
cp /data/node_modules/node-red-contrib-opc-da/patches/node-dcom/frameworkhelper.js /data/node_modules/node-dcom/dcom/core/
```

---

## 五、已解决的历史问题

### 5.1 ABB Freelance 连接失败 — Buffer 越界（已修复）

**报错：**
```
RangeError [ERR_OUT_OF_RANGE]: The value of "offset" is out of range. It must be >= 0 and <= 12. Received 16
```

**根因分析：**
- 远程激活（RemActivation）请求的接口 IID 就是 `39C13A4D-011E-11D0-9675-0020AFD8ADB3`（IOPCServer）
- 激活返回的 MInterfacePointer 已经带有 IOPCServer 接口
- 但 `opcServer.init(comObject)` 又调了一次 `comObject.queryInterface(IOPCServer_IID)`
- `ComObjectImpl.queryInterface()` 走 `IRemUnknown::RemQueryInterface`（通过 `ComServer.getInterface()`）
- ABB Freelance 不支持或不正确实现了 IRemUnknown 接口，返回了只有 13 字节的空/截断响应
- NDR 解析时 index 跑到 16，13 字节的 buffer 装不下 → RangeError

**修复（`comobjcimpl.js`）：**
- `queryInterface()` 中添加短路逻辑：如果请求的 IID 与当前 InterfacePointer 的 IID 相同，直接返回 `this`（self），不走 IRemUnknown 远程调用
- 短路路径中的 addRef 同样用 try-catch 包裹（ABB Freelance 的 addRef 返回 E_ACCESSDENIED）
- 不影响 WinCC 等标准 DCOM 实现

---

## 六、AB Freelance DCOM 兼容性结论

### 6.1 根本原因
ABB Freelance 2000 的 DCOM 实现与 WinCC、iFix 等不同，对安全上下文的要求更严格：

| 对比项 | WinCC / iFix | ABB Freelance |
|--------|-------------|---------------|
| 激活返回接口数 | 完整返回 | 只返回 4/9 |
| IRemUnknown | ✅ 接受 | ❌ 必须走 Windows 原生 DCOM 安全上下文 |
| AddGroup / 读写 | ✅ 接受 | ❌ E_ACCESSDENIED |

纯 JS 的 `node-dcom` 库（基于 J-Interop 移植，最后更新 2019 年）无法完全模拟 Windows DCOM 的安全上下文协商细节，导致与 ABB Freelance 的互操作存在根本性局限。

### 6.2 推荐方案：OpenOPC HTTP 桥接

在 ABB OPC Server 所在的 Windows 机器上利用已有的 **OpenOPC 1.3.1**（Python 2.7）加一层 HTTP 桥，Node-RED 通过 HTTP GET 读取数据。

**架构：**
```
ABB Freelance OPC Server (Windows)
    ↕ Windows 原生 DCOM（ABB 兼容）
OpenOPC 1.3.1 (Python 2.7)
    ↕ HTTP (Flask, 端口 5000)
Node-RED Docker → http request 节点
```

**Windows 上创建 `opc_bridge.py`：**
```python
# -*- coding: utf-8 -*-
from flask import Flask, jsonify, request
import OpenOPC
import logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
opc = None

@app.route('/connect')
def connect():
    global opc
    opc = OpenOPC.client()
    opc.connect('Freelance2000OPCServer.31.1')
    return jsonify({'status': 'ok'})

@app.route('/read')
def read():
    tag = request.args.get('tag')
    if not tag:
        return jsonify({'error': 'no tag'}), 400
    val = opc.read(tag)
    return jsonify({
        'tag': tag,
        'value': val[0][1],
        'quality': val[0][2],
        'timestamp': val[0][3]
    })

@app.route('/list')
def list_tags():
    tags = opc.list()
    return jsonify(tags)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

**启动桥接：**
```bash
C:\Python27\python.exe opc_bridge.py
```

**Node-RED 配置：**
- 节点：`http request`
- URL：`http://<windows-ip>:5000/read?tag=变量路径`
- 输出：解析返回的 JSON 中的 `value` 字段

---

## 八、已知限制

1. **必须设置 `NODE_OPTIONS=--openssl-legacy-provider`** — MD4/DES-ECB 被 OpenSSL 3.0 禁用
2. **分批读取未实现** — 5000+ 点可能超时
3. **补丁通过 postinstall 覆盖 node_modules 文件** — npm 重新安装会覆盖，需要重新打补丁
4. **node-dcom 项目已废弃** — 最后更新 2019 年，不支持现代 Node.js
5. **ABB Freelance DCOM 不兼容** — 纯 JS DCOM 栈无法完成 IRemUnknown 和 AddGroup 操作，必须通过 OpenOPC HTTP 桥接替代

---

## 九、重要文件路径

| 文件 | 作用 |
|---|---|
| `red/opc-da.js` | Node-RED 节点主逻辑 |
| `red/opc-da.html` | Node-RED 节点 UI（含 ProgId 列表） |
| `patches/apply.js` | postinstall 补丁脚本 |
| `patches/node-dcom/*.js` | 10 个补丁文件（含 RemActivation.js, type1message.js, remunknown.js 等） |
| `opc-bridge.py` | （建议创建）OpenOPC HTTP 桥接脚本 |

---

## 十、Git 提交历史

```
2ccba99 debug: add step logging to OPC-DA setup for ABB Freelance troubleshooting
22bb051 fix: make addRef non-fatal for ABB Freelance OPC Server
4ae0913 fix: raise DCOM protection level to INTEGRITY for ABB Freelance (已 revert)
9a9d5b4 fix: use property assignment for NTLMv2 (method name conflicts with property)
098fff0 fix: enable NTLMv2 for ABB Freelance OPC Server compatibility
a48cb98 fix: use generic ABB Freelance ProgId (version number varies)
b2967b6 fix: comobjcimpl getResultAsIntAt bug + add ABB Freelance ProgId
e603087 fix: improve postinstall patch reliability
519bfab fix: ComServer constructor 4-arg call breaks session.getStub()
d8f6eb6 v2.0.0: Fix NTLM auth, memory leaks, add ABB+ industrial OPC-DA support
```
