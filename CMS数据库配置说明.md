# CMS数据库配置说明

## 评分任务系统所需的数据库配置

### 1. 新建集合：UserRatingTasks

这是评分任务系统的核心数据集合，用于存储每个用户的任务状态和完成记录。

#### 集合基本信息
- **集合ID**: `UserRatingTasks`
- **权限设置**: 
  - 站点成员可读取自己的记录
  - 站点成员可创建
  - 站点成员可更新自己的记录
  - 管理员拥有所有权限

#### 字段配置

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `_id` | Text | 是 | 自动生成 | 系统自动生成的ID |
| `_owner` | Text | 是 | 当前用户 | 系统字段，记录所有者 |
| `_createdDate` | Date | 是 | 当前时间 | 系统字段，创建时间 |
| `_updatedDate` | Date | 是 | 当前时间 | 系统字段，更新时间 |
| `userId` | Text | 是 | - | 用户ID（与_owner相同） |
| `currentTask` | Object | 否 | null | 当前任务信息（JSON对象） |
| `completedTasks` | Array | 是 | [] | 已完成的作品序号数组 |
| `totalCompleted` | Number | 是 | 0 | 完成总数 |

#### currentTask 对象结构
```json
{
  "workNumber": 123,           // 作品序号
  "weight": 85,                // 冷门权重
  "currentRatings": 5,         // 当前评分数
  "assignedDate": "2025-10-01T10:00:00.000Z",  // 分配时间
  "status": "pending"          // 状态: pending|completed
}
```

#### completedTasks 数组示例
```json
[1, 5, 12, 23, 45, 67, 89, ...]
```

#### 创建步骤（Wix后台操作）

1. 进入 Wix 编辑器
2. 点击左侧菜单 **CMS** (Content Manager)
3. 点击 **+ Add Collection** (新建集合)
4. 选择 **Start from Scratch** (从头开始)
5. 集合名称输入：`UserRatingTasks`
6. 添加以下字段：

**字段1：userId**
- 类型：Text
- 字段Key：`userId`
- 必填：✓
- 唯一：✓ (建议设置为唯一索引)

**字段2：currentTask**
- 类型：JSON (Object)
- 字段Key：`currentTask`
- 必填：× 
- 默认值：留空

**字段3：completedTasks**
- 类型：JSON (Array)
- 字段Key：`completedTasks`
- 必填：✓
- 默认值：`[]`

**字段4：totalCompleted**
- 类型：Number
- 字段Key：`totalCompleted`
- 必填：✓
- 默认值：`0`

7. 权限设置：
   - 点击集合设置（齿轮图标）
   - 选择 **Permissions** 标签
   - 设置：
     - **Who can read content**: Site members (仅自己的内容)
     - **Who can create content**: Site members
     - **Who can update content**: Site members (仅自己的内容)
     - **Who can delete content**: Admin only

---

### 2. 修改现有集合：enterContest034

需要在作品集合中添加一个字段来存储当前评分数，以提高查询效率。

#### 新增字段

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `currentRatingCount` | Number | 否 | 0 | 当前有效评分数（排除作者自评） |

#### 添加步骤

1. 进入 CMS
2. 找到 `enterContest034` 集合
3. 点击 **Manage Fields**
4. 点击 **+ Add Field**
5. 选择类型：**Number**
6. 字段名称：`currentRatingCount`
7. 字段Key：`currentRatingCount`
8. 默认值：`0`
9. 点击保存

---

### 3. 验证现有集合配置

确保以下集合已正确配置并可访问：

#### BOFcomment 集合
需要包含以下字段：
- `workNumber` (Number) - 作品序号
- `score` (Number) - 评分
- `comment` (Text) - 评论内容
- `replyTo` (Text/Reference) - 回复到哪条评论
- `_owner` (Text) - 评论者ID

#### jobApplication089 集合（报名表单）
需要包含：
- `_owner` (Text) - 报名用户ID
- 其他报名相关字段

---

## 数据库索引优化建议

为了提高查询性能，建议在以下字段上创建索引：

### UserRatingTasks 集合
- `userId` - 唯一索引
- `totalCompleted` - 升序索引（用于统计查询）

### enterContest034 集合
- `sequenceId` - 唯一索引（应该已存在）
- `currentRatingCount` - 升序索引（用于冷门权重计算）
- `isDq` - 布尔索引（快速过滤淘汰作品）

### BOFcomment 集合
- `workNumber` - 升序索引（应该已存在）
- `_owner` - 升序索引（应该已存在）
- `replyTo` - 升序索引（用于区分主评论和回复）

---

## 初始化数据脚本（可选）

如果需要为现有用户初始化任务记录，可以在后端运行以下脚本：

```javascript
// backend/initializeTasks.jsw
import wixData from 'wix-data';

export async function initializeAllUserTasks() {
  try {
    // 获取所有报名用户
    const registrations = await wixData.query('jobApplication089').find();
    const userIds = [...new Set(registrations.items.map(r => r._owner))];
    
    console.log(`准备初始化 ${userIds.length} 个用户的任务记录...`);
    
    for (const userId of userIds) {
      // 检查是否已有记录
      const existing = await wixData
        .query('UserRatingTasks')
        .eq('userId', userId)
        .find();
      
      if (existing.items.length === 0) {
        // 创建新记录
        await wixData.insert('UserRatingTasks', {
          userId: userId,
          currentTask: null,
          completedTasks: [],
          totalCompleted: 0
        });
        console.log(`已初始化用户: ${userId}`);
      }
    }
    
    console.log('初始化完成！');
    return { success: true };
    
  } catch (error) {
    console.error('初始化失败:', error);
    throw error;
  }
}
```

---

## 数据迁移注意事项

### 如果已有评分数据
如果系统中已经存在用户评分数据，需要运行同步脚本将现有评分记录同步到任务系统：

```javascript
// 在backend/ratingTaskManager.jsw中已提供
// 调用方法：
import { syncAllUserRatings } from 'backend/ratingTaskManager.jsw';

// 运行一次即可
await syncAllUserRatings();
```

### 更新作品评分计数
为现有作品更新 `currentRatingCount` 字段：

```javascript
// 在backend/ratingTaskManager.jsw中已提供
// 调用方法：
import { updateAllWorkRatingCounts } from 'backend/ratingTaskManager.jsw';

// 运行一次即可
await updateAllWorkRatingCounts();
```

---

## 定时任务配置（推荐）

为了保持数据同步和系统正常运行，建议配置以下定时任务：

### 方式1：使用 Wix Scheduled Jobs（推荐）

在 Wix 后台配置定时作业：

1. 创建文件 `backend/jobs.config`
2. 添加以下配置：

```json
{
  "jobs": [
    {
      "functionLocation": "/backend/ratingTaskManager.jsw",
      "functionName": "syncAllUserRatings",
      "description": "同步所有用户评分记录",
      "executionConfig": {
        "cronExpression": "0 2 * * *"
      }
    },
    {
      "functionLocation": "/backend/ratingTaskManager.jsw",
      "functionName": "updateAllWorkRatingCounts",
      "description": "更新所有作品评分计数",
      "executionConfig": {
        "cronExpression": "0 3 * * *"
      }
    }
  ]
}
```

**Cron表达式说明**：
- `0 2 * * *` - 每天凌晨2点运行
- `0 3 * * *` - 每天凌晨3点运行

### 方式2：使用 Wix Events（备选）

如果不支持定时任务，可以在特定事件触发时运行同步：

```javascript
// backend/events.js
import { syncAllUserRatings, updateAllWorkRatingCounts } from 'backend/ratingTaskManager.jsw';

// 在适当的事件中调用
export function onDailyMaintenance() {
  syncAllUserRatings().catch(console.error);
  updateAllWorkRatingCounts().catch(console.error);
}
```

---

## 常见问题排查

### 1. 用户看不到任务
**可能原因**：
- 用户未报名（不在jobApplication089集合中）
- UserRatingTasks记录未创建
- 所有作品已达标或用户已完成所有任务

**解决方法**：
- 检查用户是否在jobApplication089集合中
- 运行 `syncAllUserRatings()` 同步记录
- 检查作品评分状态

### 2. 冷门权重不准确
**可能原因**：
- `currentRatingCount` 字段未更新
- 作品提交时间计算错误

**解决方法**：
- 运行 `updateAllWorkRatingCounts()` 更新计数
- 检查作品的 `_createdDate` 字段

### 3. 任务未自动分配
**可能原因**：
- 后端函数权限配置错误
- 没有符合条件的候选作品

**解决方法**：
- 检查 `permissions.json` 配置
- 查看控制台日志确认候选作品数量

---

## 权限配置检查清单

确保以下权限配置正确：

- ✅ UserRatingTasks 集合：站点成员可读取/创建/更新自己的记录
- ✅ enterContest034 集合：所有人可读取
- ✅ BOFcomment 集合：站点成员可创建和读取
- ✅ jobApplication089 集合：所有人可读取
- ✅ backend/ratingTaskManager.jsw：所有后端方法对站点成员开放

---

## 数据备份建议

定期备份以下集合数据：

1. **UserRatingTasks** - 用户任务进度
2. **BOFcomment** - 评论数据
3. **enterContest034** - 作品数据

可以使用 Wix Data API 导出数据或使用 Wix 后台的导出功能。

---

完成以上配置后，评分任务系统即可正常运行！


