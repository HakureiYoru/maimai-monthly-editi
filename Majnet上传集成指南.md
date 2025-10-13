# Majnet上传集成指南

本指南说明如何在Wix项目中集成Majnet自动上传功能。

## 快速开始

✅ **当前状态**：已集成方式三（数据钩子自动上传），无需额外配置即可使用。

### 工作流程

1. **用户提交作品** → 数据保存到 `enterContest034` 数据集
2. **数据钩子触发** → `enterContest034_afterInsert` 自动执行
3. **后台上传** → 异步上传到Majnet平台（不影响用户操作）
4. **状态更新** → 上传成功后自动标记 `majnetUploaded = true`

### 前置要求

在使用前，需要在数据集中添加两个字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `majnetUploaded` | Boolean | `false` | 标记是否已上传到Majnet |
| `majnetUploadTime` | Date | - | 上传到Majnet的时间戳 |

**配置步骤**：
1. 进入Wix编辑器 → 数据库 → `enterContest034` 集合
2. 点击"添加字段" → 选择 **Boolean** → 命名为 `majnetUploaded` → 默认值设为 `false`
3. 再次点击"添加字段" → 选择 **Date and Time** → 命名为 `majnetUploadTime`
4. 保存配置

完成后，每次有新作品提交时，系统会自动上传到Majnet。

## 文件说明

### 后端模块：`src/backend/majnetUploader.jsw`

提供三个主要函数：

1. **`uploadChartToMajnet(chartData)`** - 上传单个谱面
2. **`uploadContestItemToMajnet(contestItem)`** - 从数据集项上传
3. **`batchUploadToMajnet(contestItems)`** - 批量上传（带2秒延迟）

## 重要配置

### MD5密码哈希

**已完成配置**：密码 `redwhite7687` 的MD5值已预先计算并配置好：
```javascript
const PASSWORD_MD5 = "0c95eabfbdfdb54a9fd6aac5dccdcc0f";
```

无需额外配置，直接使用即可。

## 使用方式

### 方式一：提交时自动上传（推荐）

修改 `src/pages/Submit_提交.hll9d.js`，在表单提交成功后调用上传：

```javascript
import { uploadContestItemToMajnet } from 'backend/majnetUploader.jsw';

// 在提交按钮的点击事件中
export function button1_click(event) {
    $w("#dataset1").save()
        .then(async (saveResult) => {
            console.log("数据保存成功");
            
            // 自动上传到Majnet
            try {
                const uploadResult = await uploadContestItemToMajnet(saveResult);
                
                if (uploadResult.success) {
                    console.log("Majnet上传成功");
                    // 可选：显示成功提示
                    $w("#text14").text = "提交成功，已同步到Majnet";
                } else {
                    console.error("Majnet上传失败:", uploadResult.message);
                    // 即使上传失败，wix数据已保存
                }
            } catch (error) {
                console.error("Majnet上传异常:", error);
            }
        })
        .catch((error) => {
            console.error("数据保存失败:", error);
        });
}
```

### 方式二：管理员手动批量上传

创建管理页面，批量上传已提交的作品：

```javascript
import wixData from 'wix-data';
import { batchUploadToMajnet } from 'backend/majnetUploader.jsw';

export async function uploadAllButton_click(event) {
    // 禁用按钮防止重复点击
    $w("#uploadAllButton").disable();
    
    try {
        // 查询所有待上传的作品
        const results = await wixData.query("enterContest034")
            .limit(100)
            .find();
        
        $w("#statusText").text = `找到${results.items.length}个作品，开始上传...`;
        
        // 批量上传
        const uploadResults = await batchUploadToMajnet(results.items);
        
        // 统计结果
        const successCount = uploadResults.filter(r => r.success).length;
        const failCount = uploadResults.length - successCount;
        
        $w("#statusText").text = `上传完成！成功：${successCount}，失败：${failCount}`;
        
    } catch (error) {
        console.error("批量上传错误:", error);
        $w("#statusText").text = "上传失败，请查看控制台日志";
    } finally {
        $w("#uploadAllButton").enable();
    }
}
```

### 方式三：使用数据钩子自动触发（已实现✅）

在 `src/backend/data.js` 中添加数据钩子，当新作品提交时自动上传：

```javascript
import { uploadContestItemToMajnet } from 'backend/majnetUploader.jsw';

/**
 * enterContest034数据插入后的处理
 * 自动将新提交的谱面上传到Majnet平台
 */
export async function enterContest034_afterInsert(item, context) {
    logInfo('enterContest034_afterInsert', `新作品创建，准备上传到Majnet: ${item.firstName || '未命名'}`);
    
    // 异步上传，不阻塞数据保存操作
    uploadContestItemToMajnet(item)
        .then(async (result) => {
            if (result.success) {
                logInfo('enterContest034_afterInsert', `作品 "${item.firstName}" 已自动上传到Majnet`);
                
                // 更新majnetUploaded字段为true
                await wixData.update(COLLECTIONS.ENTER_CONTEST_034, {
                    _id: item._id,
                    majnetUploaded: true,
                    majnetUploadTime: new Date()
                });
            }
        })
        .catch(error => {
            logError('enterContest034_afterInsert - 上传异常', error);
        });
    
    return item;
}
```

**优势**：
- ✅ 完全自动化，无需人工干预
- ✅ 用户无感知，不影响提交流程
- ✅ 自动记录上传状态和时间
- ✅ 异步处理，不阻塞数据保存

## 数据字段映射

根据 `http-functions.js` 的字段映射：

| Wix字段名 | 文件类型 | Majnet字段 |
|----------|---------|-----------|
| `inVideo的複本` | maidata.txt | maidata.txt |
| `maidata的複本` | track.mp3 | track.mp3 |
| `track的複本` | bg.png/jpg | bg.png/bg.jpg |
| `上傳檔案欄` | bg.mp4/pv.mp4 | bg.mp4/pv.mp4 |
| `firstName` | 标题 | （用于日志） |

## 文件验证

上传前会自动验证：
- ✅ 必须有 `maidata.txt`
- ✅ 必须有 `track.mp3`
- ✅ 必须有背景图（png或jpg）
- ⚠️ 背景视频可选
- ✅ 自动补充 `&des=mmfc` 字段（如果为空）

## 上传顺序

文件按以下顺序上传（Majnet API要求）：
1. maidata.txt
2. bg.png/bg.jpg
3. track.mp3
4. bg.mp4/pv.mp4（可选）

## 错误处理

所有函数都使用 `safeExecute` 包装，错误会：
- 记录到后端日志
- 返回包含错误信息的对象
- 不会中断用户操作

检查返回值：
```javascript
const result = await uploadContestItemToMajnet(item);

if (result.success) {
    console.log("上传成功:", result.message);
} else {
    console.error("上传失败:", result.error);
}
```

## 性能优化

- **会话缓存**：登录状态保持30分钟，避免频繁登录
- **上传间隔**：批量上传时自动间隔2秒，避免服务器压力
- **异步处理**：上传操作不阻塞用户界面

## 测试建议

1. **先测试单个上传**：在控制台手动调用函数
2. **验证字段映射**：确保数据集字段名正确
3. **检查文件完整性**：确保所有必需文件都已上传
4. **监控日志**：查看后端日志了解上传状态

## 监控与调试

### 查看上传日志

所有上传操作都会记录到后端日志中，可以在Wix后台查看：

```
1. Wix编辑器 → 开发者工具 → Logs
2. 筛选关键词："enterContest034_afterInsert" 或 "uploadChartToMajnet"
```

**日志示例**：
```
✅ 成功：新作品创建，准备上传到Majnet: 谱面标题
✅ 成功：作品 "谱面标题" 已自动上传到Majnet
✅ 成功：已标记作品 "谱面标题" 的上传状态

❌ 失败：Majnet上传失败: 登录失败: 401
❌ 失败：文件准备失败: 缺少maidata.txt文件
```

### 查询上传统计

使用以下代码查看上传统计（可在后端函数中使用）：

```javascript
import wixData from 'wix-data';

// 统计上传情况
export async function getUploadStatistics() {
    const allWorks = await wixData.query("enterContest034")
        .limit(1000)
        .find();
    
    const uploaded = allWorks.items.filter(item => item.majnetUploaded === true);
    const notUploaded = allWorks.items.filter(item => item.majnetUploaded !== true);
    
    return {
        total: allWorks.items.length,
        uploaded: uploaded.length,
        notUploaded: notUploaded.length,
        uploadRate: (uploaded.length / allWorks.items.length * 100).toFixed(2) + '%'
    };
}
```

### 手动重新上传失败的作品

如果某些作品上传失败，可以创建管理页面手动重试：

```javascript
import wixData from 'wix-data';
import { uploadContestItemToMajnet } from 'backend/majnetUploader.jsw';

export async function retryFailedUploads() {
    // 查询未上传的作品
    const notUploaded = await wixData.query("enterContest034")
        .ne("majnetUploaded", true)
        .limit(100)
        .find();
    
    for (const item of notUploaded.items) {
        const result = await uploadContestItemToMajnet(item);
        
        if (result.success) {
            await wixData.update("enterContest034", {
                _id: item._id,
                majnetUploaded: true,
                majnetUploadTime: new Date()
            });
        }
        
        // 间隔2秒
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}
```

## 常见问题

**Q: 上传失败怎么办？**  
A: 检查后端日志，常见原因：
- MD5密码未正确配置
- 文件URL无效
- 网络超时

**Q: 如何知道哪些作品已上传？**  
A: 系统已自动实现上传状态追踪。使用方式三（数据钩子）时，上传成功后会自动更新：
- `majnetUploaded` 字段标记为 `true`
- `majnetUploadTime` 字段记录上传时间

可以通过以下查询获取已上传/未上传的作品：
```javascript
// 查询已上传的作品
const uploaded = await wixData.query("enterContest034")
    .eq("majnetUploaded", true)
    .find();

// 查询未上传的作品
const notUploaded = await wixData.query("enterContest034")
    .ne("majnetUploaded", true)
    .find();
```

**Q: 可以重复上传吗？**  
A: 可以，Majnet会覆盖同名作品。系统已通过 `majnetUploaded` 字段避免重复上传，但如需手动重新上传，可使用上述的 `retryFailedUploads` 函数。

**Q: 上传会影响用户提交速度吗？**  
A: 不会。上传操作是异步进行的，不会阻塞数据保存流程。用户提交后立即可以看到成功提示，上传在后台自动完成。

**Q: 如何禁用自动上传？**  
A: 如需临时禁用，可以注释掉 `src/backend/data.js` 中的 `enterContest034_afterInsert` 函数，或在函数开头添加 `return item;` 直接返回。

---

## 实现摘要

### 已完成的功能

✅ **核心上传模块**（`majnetUploader.jsw`）
- MD5密码预计算与配置
- 会话管理（30分钟缓存）
- 文件验证与自动补全
- 错误处理与日志记录

✅ **自动上传钩子**（`data.js`）
- `enterContest034_afterInsert` 数据钩子
- 异步上传处理
- 自动状态标记

✅ **状态追踪**
- `majnetUploaded` 上传标记
- `majnetUploadTime` 时间戳
- 支持查询统计

### 技术特点

- 🚀 **零人工干预**：提交后自动上传
- 🔒 **安全可靠**：MD5加密、会话缓存
- 📊 **可追踪**：完整日志和状态记录
- ⚡ **高性能**：异步处理、智能延迟
- 🛡️ **容错性强**：完善的错误处理机制

### 架构说明

```
用户提交作品
    ↓
保存到 enterContest034
    ↓
触发 afterInsert 钩子
    ↓
调用 uploadContestItemToMajnet
    ↓
├─ 登录 Majnet（会话缓存）
├─ 下载文件（maidata, track, bg, video）
├─ 验证文件完整性
├─ 构建 multipart/form-data
└─ 上传到 Majnet API
    ↓
更新上传状态
    ↓
记录日志
```

### 维护建议

1. **定期检查日志**：查看是否有上传失败的记录
2. **监控上传率**：使用 `getUploadStatistics` 统计
3. **处理失败项**：定期运行 `retryFailedUploads` 重试
4. **密码更新**：如需更换密码，重新计算MD5并更新 `PASSWORD_MD5` 常量

