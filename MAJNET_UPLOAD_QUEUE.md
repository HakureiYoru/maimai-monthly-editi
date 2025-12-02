# Majnet 上传队列系统说明

## 概述

为了避免多个用户同时在前端提交上传请求导致服务器压力过大和被 Cloudflare 拦截，我们实现了一个请求队列系统。

## 工作原理

### 1. 队列管理器 (UploadQueue)

- **自动排队**: 当多个用户同时提交上传请求时，这些请求会自动加入队列
- **顺序执行**: 队列按照先进先出（FIFO）原则依次处理任务
- **延迟保护**: 每次上传之间强制间隔 2 秒（`UPLOAD_DELAY`），避免请求过于频繁
- **会话复用**: 队列中的所有任务共享同一个登录会话，减少登录次数

### 2. 使用方式

#### 单个上传（前端调用）
```javascript
// 前端代码示例
import { uploadContestItemToMajnet } from 'backend/majnetUploader.jsw';

// 用户提交上传时，自动加入队列
const result = await uploadContestItemToMajnet(contestItem);
// 返回的 result 包含上传结果，即使前面有其他任务在排队
```

#### 批量上传（管理员操作）
```javascript
import { batchUploadToMajnet } from 'backend/majnetUploader.jsw';

// 批量上传会跳过队列，直接顺序执行（已在内部控制延迟）
const results = await batchUploadToMajnet(contestItems);
```

#### 查询队列状态
```javascript
import { getUploadQueueStatus } from 'backend/majnetUploader.jsw';

// 前端可以查询当前队列状态，向用户展示等待情况
const status = await getUploadQueueStatus();
// 返回: { queueLength, isProcessing, currentTask, message, ... }
```

### 3. 队列状态字段说明

- **queueLength**: 队列中等待的任务数量
- **isProcessing**: 是否正在处理任务
- **currentTask**: 当前正在执行的任务ID（格式: `标题_时间戳`）
- **lastUploadTime**: 上次上传完成的时间戳
- **message**: 人类可读的状态描述

### 4. 日志信息

队列系统会记录详细的日志信息：

```
[UploadQueue] 任务已加入队列: 作品标题_1234567890 | 队列长度: 3
[UploadQueue] 等待 1500ms 后执行任务: 作品标题_1234567890
[UploadQueue] 开始执行任务: 作品标题_1234567890 | 等待时长: 5.2秒 | 剩余队列: 2
[UploadQueue] 任务完成: 作品标题_1234567890 | 成功: true
[UploadQueue] 队列处理完成
```

## 优势

1. **防止服务器过载**: 控制并发请求数量，避免大量请求同时到达 Majnet 服务器
2. **避免被封禁**: 请求之间有延迟，模拟正常用户行为，降低被 Cloudflare 拦截的风险
3. **用户体验**: 用户提交后立即得到响应，任务在后台排队执行
4. **可追踪**: 前端可以查询队列状态，向用户展示等待位置
5. **稳定性**: 即使有任务失败，也不会影响队列中其他任务的执行

## 配置参数

在 `MAJNET_CONFIG` 中可以调整：

- `UPLOAD_DELAY`: 上传间隔时间（默认 2000ms）
- `MAX_RETRIES`: 失败重试次数（默认 3 次）
- `BASE_TIMEOUT`: 基础超时时间（默认 30 秒）

## 注意事项

1. **单个上传 vs 批量上传**:
   - 单个上传（前端调用）：自动使用队列
   - 批量上传（管理员）：跳过队列，直接顺序执行

2. **队列不会持久化**: 
   - 如果服务器重启，队列会清空
   - 正在等待的任务需要用户重新提交

3. **会话超时**: 
   - 登录会话 30 分钟后过期
   - 队列处理器会自动重新登录

## 前端集成建议

可以在前端添加一个状态指示器：

```javascript
// 定时查询队列状态
async function updateQueueStatus() {
  const status = await getUploadQueueStatus();
  
  if (status.queueLength > 0) {
    // 显示: "您的上传正在队列中，前面还有 X 个任务"
    showQueueMessage(status.message);
  } else {
    hideQueueMessage();
  }
}

// 每 5 秒更新一次
setInterval(updateQueueStatus, 5000);
```

## 测试场景

### 测试 1: 多用户同时上传
1. 模拟 5 个用户同时点击上传按钮
2. 观察日志，应该看到 5 个任务依次执行
3. 每次执行间隔至少 2 秒

### 测试 2: 队列状态查询
1. 提交 3 个上传任务
2. 立即调用 `getUploadQueueStatus()`
3. 应该返回 `queueLength: 2` 或 `queueLength: 3`（取决于第一个是否已开始）

### 测试 3: 混合场景
1. 用户 A 提交单个上传（进入队列）
2. 管理员执行批量上传 5 个（跳过队列）
3. 用户 B 提交单个上传（进入队列）
4. 观察执行顺序应为：A → 批量5个 → B

## 更新日志

- **2024-12-02**: 初始实现队列系统
  - 添加 `UploadQueue` 类
  - 修改 `uploadChartToMajnet` 支持队列
  - 添加 `getUploadQueueStatus` 查询接口

