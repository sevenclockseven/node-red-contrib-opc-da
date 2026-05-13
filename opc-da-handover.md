# node-red-contrib-opc-da 改造交接文档

> 最后更新: 2026-05-13
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

## 三、已修复的 Bug（共 10 个）

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

### 3.7 OpenSSL 3.0 兼容
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

## 六、已知限制

1. **必须设置 `NODE_OPTIONS=--openssl-legacy-provider`** — MD4/DES-ECB 被 OpenSSL 3.0 禁用
2. **分批读取未实现** — 5000+ 点可能超时
3. **补丁通过 postinstall 覆盖 node_modules 文件** — npm 重新安装会覆盖，需要重新打补丁
4. **node-dcom 项目已废弃** — 最后更新 2019 年，不支持现代 Node.js

---

## 七、重要文件路径

| 文件 | 作用 |
|---|---|
| `red/opc-da.js` | Node-RED 节点主逻辑 |
| `red/opc-da.html` | Node-RED 节点 UI（含 ProgId 列表） |
| `patches/apply.js` | postinstall 补丁脚本 |
| `patches/node-dcom/*.js` | 5 个补丁文件 |

---

## 八、Git 提交历史

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
