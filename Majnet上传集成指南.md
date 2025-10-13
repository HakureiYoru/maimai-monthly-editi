# Majnet上传集成指南

本指南说明如何在Wix项目中集成Majnet自动上传功能。

## 快速开始

✅ **当前状态**：已集成方式三（数据钩子自动上传），并修复了关键Bug。

### 🔧 已修复的问题

| 问题 | 原因 | 解决方案 | 文件 |
|------|------|----------|------|
| ❌ 上传失败：`arrayBuffer is not a function` | Wix Velo不支持`arrayBuffer()` | 改用`buffer()`方法 | `majnetUploader.jsw` |
| ❌ 出现空白/不完整的数据项 | 缺少提交按钮处理函数 | 添加`button1_click`函数 | `Submit_提交.hll9d.js` |
| ❌ 二进制数据损坏 | 字符串拼接无法处理二进制 | 使用`Buffer.concat()` | `majnetUploader.jsw` |
| ❌ **上传后数据集变空** | `async`钩子干扰数据事务 | 使用`setTimeout`推迟上传 | `data.js` |

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

## 权限说明

### 自动上传权限（所有用户）

✅ **所有用户都可以触发自动上传**

使用数据钩子（`enterContest034_afterInsert`）实现的自动上传，对所有用户都生效：

```
用户提交作品（需要有 enterContest034 写入权限）
    ↓
触发 afterInsert 钩子（后端执行，无权限限制）
    ↓
调用 uploadContestItemToMajnet（后端到后端，无权限限制）
    ↓
自动上传到 Majnet
```

**权限工作原理**：
- 📌 **数据钩子**：在后端自动触发，以完整后端权限执行
- 📌 **后端调用**：从钩子调用上传函数时，是后端到后端的调用
- 📌 **用户无感知**：用户只需有数据集的写入权限即可

### 手动上传权限（所有成员）

从 `permissions.json` 配置：

```json
"majnetUploader.jsw": {
  "uploadChartToMajnet": {
    "siteOwner": { "invoke": true },     // ✅ 网站所有者可调用
    "siteMember": { "invoke": true },    // ✅ 普通成员可调用
    "anonymous": { "invoke": false }     // ❌ 匿名用户不可调用
  },
  "uploadContestItemToMajnet": {
    "siteOwner": { "invoke": true },     // ✅ 网站所有者可调用
    "siteMember": { "invoke": true },    // ✅ 普通成员可调用
    "anonymous": { "invoke": false }     // ❌ 匿名用户不可调用
  },
  "batchUploadToMajnet": {
    "siteOwner": { "invoke": true },     // ✅ 网站所有者可调用
    "siteMember": { "invoke": false },   // ❌ 普通成员不可调用（防滥用）
    "anonymous": { "invoke": false }     // ❌ 匿名用户不可调用
  }
}
```

**这意味着**：
- ✅ 普通用户提交作品 → 自动上传（通过数据钩子）
- ✅ **所有注册用户**都可以从前端手动调用单个上传函数
- ✅ 管理员可以使用批量上传功能
- ❌ 普通成员不能批量上传（防止滥用）
- ❌ 匿名用户不能调用任何上传函数

### 数据集权限要求

确保用户有 `enterContest034` 数据集的写入权限：

1. 进入 Wix 编辑器 → 数据库 → `enterContest034` → 权限设置
2. 设置为：
   - **创建内容**：网站成员（Site Member）
   - **更新内容**：内容作者（Content Author）
   - **删除内容**：网站所有者（Site Owner）

这样所有注册用户都可以提交作品并触发自动上传。

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

### 方式一：提交时手动上传

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

### 方式三：用户手动重新上传

允许用户在个人页面重新上传自己的作品（需要登录）：

```javascript
import wixData from 'wix-data';
import wixUsers from 'wix-users';
import { uploadContestItemToMajnet } from 'backend/majnetUploader.jsw';

export async function reuploadButton_click(event) {
    const currentUser = wixUsers.currentUser;
    
    if (!currentUser.loggedIn) {
        $w("#statusText").text = "请先登录";
        return;
    }
    
    // 禁用按钮
    $w("#reuploadButton").disable();
    $w("#statusText").text = "正在重新上传...";
    
    try {
        // 获取当前用户的作品
        const results = await wixData.query("enterContest034")
            .eq("_owner", currentUser.id)
            .find();
        
        if (results.items.length === 0) {
            $w("#statusText").text = "未找到您的作品";
            $w("#reuploadButton").enable();
            return;
        }
        
        const myWork = results.items[0];
        
        // 重新上传到Majnet
        const uploadResult = await uploadContestItemToMajnet(myWork);
        
        if (uploadResult.success) {
            $w("#statusText").text = "✅ 重新上传成功！";
            
            // 更新上传时间
            await wixData.update("enterContest034", {
                _id: myWork._id,
                majnetUploaded: true,
                majnetUploadTime: new Date()
            });
        } else {
            $w("#statusText").text = `❌ 上传失败: ${uploadResult.message}`;
        }
    } catch (error) {
        console.error("重新上传错误:", error);
        $w("#statusText").text = "❌ 上传失败，请查看控制台";
    } finally {
        $w("#reuploadButton").enable();
    }
}
```

**使用场景**：
- 用户发现之前上传失败，想要重试
- 用户更新了作品文件，需要重新上传
- Majnet服务器之前不可用，现在想补传

### 方式四：使用数据钩子自动触发（已实现✅）

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

**权限配置**：
- ✅ 所有注册用户都可以通过数据钩子自动上传
- ✅ 所有注册用户都可以从前端手动调用单个上传函数
- ✅ 仅管理员可以批量上传
- ❌ 匿名用户不能调用上传函数

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

**成功流程**：
```
✅ INFO: 新作品创建，准备上传到Majnet: 谱面标题
✅ INFO: 字段映射: maidata=true, track=true, bg=true, video=false, title=谱面标题
✅ INFO: loginToMajnet: 登录成功
✅ INFO: 开始上传谱面: 谱面标题
✅ INFO: 正在获取maidata.txt...
✅ INFO: maidata.txt准备完成
✅ INFO: 正在获取背景图...
✅ INFO: 背景图准备完成 (png)
✅ INFO: 正在获取音频文件...
✅ INFO: 音频文件准备完成
✅ INFO: 准备上传 3 个文件...
✅ INFO: 请求体构建完成，大小: 12345678 字节
✅ INFO: 发送上传请求到Majnet...
✅ INFO: 收到响应，状态码: 200
✅ INFO: 上传成功: 谱面标题
✅ INFO: 已标记作品 "谱面标题" 的上传状态
```

**失败示例**：
```
❌ ERROR: 字段映射: maidata=false, track=true, bg=true, video=false, title=作品
❌ ERROR: 文件准备失败: 缺少maidata.txt文件
❌ ERROR: Majnet上传失败

或

❌ ERROR: 正在获取背景图...
❌ ERROR: 背景图获取失败
❌ ERROR: 文件准备失败: 背景图获取失败
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

## 故障排查指南

### 根据日志诊断问题

#### 1. 字段映射问题
**日志**：`字段映射: maidata=false, track=true, bg=true`

**原因**：数据集字段名不匹配或字段为空

**解决方案**：
```javascript
// 检查数据集字段名是否正确
字段映射:
- inVideo的複本 → maidata.txt
- maidata的複本 → track.mp3
- track的複本 → bg.png/jpg
- 上傳檔案欄 → bg.mp4/pv.mp4
```

#### 2. 文件获取失败
**日志**：`正在获取maidata.txt...` → `maidata.txt内容为空`

**原因**：
- 文件上传不完整
- 文件URL无效
- 文件被删除

**解决方案**：
1. 重新上传文件
2. 检查文件是否存在于 Wix 媒体库
3. 验证文件 URL 是否有效

#### 3. 上传请求失败 - 400 错误（常见⚠️）
**日志**：`发送上传请求到Majnet...` → `上传失败: 400`

**原因**：请求格式错误，Majnet拒绝接受

**可能的具体原因**：
1. **maidata.txt格式问题**
   - 文件编码不是UTF-8
   - 包含非法字符
   - 缺少必需的元数据字段

2. **文件顺序或命名问题**
   - 文件名不符合Majnet要求
   - 文件顺序不正确（应为：maidata.txt → bg.png → track.mp3 → bg.mp4）

3. **designer字段问题**
   - `&des=` 字段值包含特殊字符
   - designer字段位置不正确

4. **文件大小或格式问题**
   - 文件损坏或格式不正确
   - 文件过大

**解决方案**：
1. **查看详细日志**：
   ```
   状态码400 | 响应: [Majnet返回的错误信息] | 作品: xxx | 文件数: 3
   文件列表: [maidata.txt, bg.png, track.mp3] | boundary: xxx
   ```

2. **检查maidata.txt**：
   - 确保是纯文本文件，UTF-8编码
   - 验证 `&des=` 字段值只包含字母数字和基本符号
   - 确保文件内容完整

3. **验证文件**：
   - 检查图片是否为有效的PNG/JPG
   - 检查音频是否为有效的MP3
   - 确认文件未损坏

4. **手动测试**：
   - 下载问题作品的文件
   - 在Majnet网站手动上传测试
   - 对比成功和失败的文件差异

#### 4. 上传请求失败 - 500 错误
**日志**：`发送上传请求到Majnet...` → `上传失败: 500`

**原因**：
- Majnet 服务器内部错误
- 网络超时
- 服务器维护中

**解决方案**：
1. 检查 Majnet 服务是否正常
2. 稍后重试
3. 联系 Majnet 管理员

#### 5. 登录失败
**日志**：`登录失败: 401`

**原因**：
- MD5 密码不正确
- Majnet 账户被禁用

**解决方案**：
1. 验证 `PASSWORD_MD5` 是否正确
2. 联系 Majnet 管理员

### 调试技巧

1. **查看完整日志链**：从 `新作品创建` 到最终结果
2. **检查字段映射**：确认所有必需字段都有值
3. **分步骤诊断**：
   - 登录成功？→ 密码配置正确
   - 文件准备完成？→ 字段映射正确
   - 请求发送成功？→ 网络和 API 正常

### 成功 vs 失败对比

根据您的反馈，观察到两种情况：

| 情况 | 响应码 | Majnet | Wix数据集 | 可能原因 |
|------|--------|--------|-----------|---------|
| 您的测试 | 200 ✅ | 成功上传 | ~~空数据~~ → 已修复 | async钩子干扰事务（已解决） |
| 普通用户 | 400 ❌ | 上传失败 | 数据正常 ✅ | maidata.txt格式或内容问题 |

**下一步排查**：

当普通用户提交后收到400错误时，请查看日志中的：
```
状态码400 | 响应: [这里会显示Majnet的具体错误信息]
文件列表: [maidata.txt, bg.png, track.mp3]
```

**Majnet的响应内容**会告诉我们具体是什么问题，例如：
- "Invalid maidata format" → maidata.txt格式问题
- "Missing required field" → 缺少必需字段
- "Invalid character in designer" → designer字段有非法字符
- "File too large" → 文件过大

请分享下一次400错误的**完整日志**（包括Majnet返回的响应内容），我可以精确定位问题！

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

**Q: 如何避免空白/不完整的数据项？**  
A: 确保已实现 `button1_click` 函数（已在本次修复中添加）。另外建议：
1. 在 Wix 编辑器中，检查 Dataset 设置，**禁用"自动保存"**
2. 确保所有必填字段都设置了验证规则
3. 使用 `dataset.save()` 而非依赖自动保存
4. 在提交前验证表单完整性

**Q: 如何清理已存在的空白项目？**  
A: 可以创建一个管理页面，查询并删除空白项目：
```javascript
import wixData from 'wix-data';

export async function cleanEmptyItems() {
    const results = await wixData.query("enterContest034")
        .isEmpty("firstName") // 查找标题为空的项目
        .or(wixData.query("enterContest034").isEmpty("inVideo的複本"))
        .limit(100)
        .find();
    
    for (const item of results.items) {
        await wixData.remove("enterContest034", item._id);
        console.log(`已删除空白项目: ${item._id}`);
    }
    
    return `清理完成，删除了 ${results.items.length} 个空白项目`;
}
```

---

## 实现摘要

### 已完成的功能

✅ **核心上传模块**（`majnetUploader.jsw`）
- MD5密码预计算与配置
- 会话管理（30分钟缓存）
- 文件验证与自动补全
- 错误处理与日志记录
- ✨ **已修复**：API兼容性问题（buffer vs arrayBuffer）

✅ **自动上传钩子**（`data.js`）
- `enterContest034_afterInsert` 数据钩子
- 异步上传处理
- 自动状态标记

✅ **提交页面逻辑**（`Submit_提交.hll9d.js`）
- ✨ **已添加**：`button1_click` 提交处理函数
- 防止重复提交
- 用户反馈机制
- 完整的错误处理

✅ **权限配置**（`permissions.json`）
- ✨ **已配置**：所有注册用户可调用单个上传函数
- 管理员专属：批量上传权限
- 匿名用户：禁止调用

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

---

## 技术说明

### 数据钩子事务安全修复（重要！⚠️）

**问题**：使用 `async function` 作为 `afterInsert` 钩子导致：
- 数据上传到Majnet后，Wix数据集中的数据变成空的
- 异步操作可能干扰Wix的数据库事务
- 钩子等待Promise完成可能导致超时或回滚

**解决方案**：将钩子改为同步函数，使用 `setTimeout` 延迟上传操作

```javascript
// ❌ 错误：async 函数可能干扰事务
export async function enterContest034_afterInsert(item, context) {
    await uploadContestItemToMajnet(item); // 等待会阻塞
    return item;
}

// ✅ 正确：立即返回，延迟执行上传
export function enterContest034_afterInsert(item, context) {
    // 使用 setTimeout 推迟到下一个事件循环
    setTimeout(() => {
        uploadContestItemToMajnet(item)
            .then(result => { /* 处理结果 */ })
            .catch(error => { /* 处理错误 */ });
    }, 0);
    
    // 立即同步返回，不等待上传完成
    return item;
}
```

**原理**：
- `setTimeout(fn, 0)` 将函数推迟到当前事件循环完成后执行
- 数据钩子立即返回 `item`，Wix 完成数据保存事务
- 上传操作在事务完成后异步执行，互不干扰

**关键点**：
- ✅ 数据保存优先，确保用户数据安全
- ✅ 上传失败不影响数据保存
- ✅ 避免钩子超时导致的问题

### 提交页面修复（重要！）

**问题**：原提交页面缺少 `button1_click` 事件处理函数，导致：
- 可能创建空白或不完整的数据项
- Dataset 自动保存可能在用户未完成填写时触发
- 缺少验证和用户反馈

**解决方案**：添加了完整的提交按钮处理函数（`src/pages/Submit_提交.hll9d.js`）：

```javascript
export function button1_click(event) {
    // 1. 禁用按钮防止重复提交
    $w("#button1").disable();
    $w("#button1").label = "提交中...";
    
    // 2. 保存数据集
    $w("#dataset1").save()
        .then((saveResult) => {
            console.log("数据保存成功，作品将自动上传到Majnet");
            
            // 3. 显示成功提示
            $w("#text14").text = "✅ 提交成功！作品正在后台上传到Majnet...";
        })
        .catch((error) => {
            // 4. 错误处理
            console.error("数据保存失败:", error);
            $w("#text14").text = "❌ 提交失败，请检查所有必填字段";
            
            // 5. 重新启用按钮
            $w("#button1").enable();
            $w("#button1").label = "提交作品";
        });
}
```

**关键改进**：
- ✅ 明确的提交流程控制
- ✅ 防止重复提交（禁用按钮）
- ✅ 用户反馈（成功/失败提示）
- ✅ 错误处理和恢复机制

### API 兼容性修复

**问题**：Wix Velo 的 `fetch` API 在 Node.js 环境中不支持 `arrayBuffer()` 方法。

**解决方案**：
- 使用 `response.buffer()` 替代 `response.arrayBuffer()`
- 使用 `Buffer.concat()` 构建 multipart/form-data，而非字符串拼接
- 正确处理二进制数据与文本数据的混合

**相关代码**：
```javascript
// 获取二进制文件
const buffer = await response.buffer(); // ✅ 正确
// const arrayBuffer = await response.arrayBuffer(); // ❌ 在Wix中不支持

// 构建multipart请求体
const parts = [];
parts.push(Buffer.from(header, 'utf8'));
parts.push(content); // Buffer对象
const body = Buffer.concat(parts); // ✅ 正确处理二进制
```

