const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

function getDeepSeekApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_DEEPSEEK_API_KEY is not set in environment variables');
  }

  return apiKey;
}

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = getDeepSeekApiKey();

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API 错误 ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content as string;
}

// 任务分解接口
export interface SubTask {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedHours: number;
  dependencies: string[];
}

export interface TaskDecompositionResult {
  mainTask: string;
  subTasks: SubTask[];
  totalEstimatedHours: number;
  recommendedApproach: string;
}

// 日程安排接口
export interface ScheduledTask {
  task: string;
  date: string;
  startTime: string;
  endTime: string;
  priority: 'high' | 'medium' | 'low';
  notes: string;
}

export interface ScheduleResult {
  tasks: ScheduledTask[];
  totalDays: number;
  notes: string;
}

export type RewriteMode = 'short' | 'detailed';

/**
 * 使用 AI 将任务描述写得更详细
 */
export async function enhanceTaskWithAI(
  taskTitle: string,
  priority: '紧急' | '普通',
  mode: RewriteMode = 'detailed'
): Promise<string> {
  const modeInstruction =
    mode === 'short'
      ? '请改写为更短、更清晰的一条任务，长度控制在 12-24 字。'
      : '请改写为更详细、可执行的一条任务，长度控制在 30-80 字。';

  const prompt = `你是一个老板的秘书，帮助老板安排日程。${modeInstruction}

原任务：${taskTitle}
优先级：${priority}

要求：
1. 保持为单条任务，不要拆成列表
2. 明确动作对象、产出结果和完成标准
3. 根据模式控制长度
4. 使用中文
5. 只返回改写后的任务文本，不要其他说明`;

  const responseText = await callDeepSeek(prompt);
  return responseText.trim().replace(/^"|"$/g, '');
}

/**
 * 使用 AI 分解一个大任务为多个小任务
 */
export async function decomposeTask(largeTask: string): Promise<TaskDecompositionResult> {
  const prompt = `你是一个项目管理专家。请将以下任务分解为具体的可执行的子任务。

大任务：${largeTask}

请以 JSON 格式返回结果，包含以下信息：
{
  "mainTask": "原始任务",
  "subTasks": [
    {
      "title": "子任务标题",
      "description": "详细描述",
      "priority": "high/medium/low",
      "estimatedHours": 数字,
      "dependencies": ["任务ID或描述"]
    }
  ],
  "totalEstimatedHours": 总小时数,
  "recommendedApproach": "推荐的实施方法"
}

要求：
1. 子任务要具体、可执行
2. 按优先级排列
3. 识别任务之间的依赖关系
4. 提供合理的时间估计
5. 只返回 JSON，不要有其他文字`;

  const responseText = await callDeepSeek(prompt);

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法解析 AI 响应');
  }

  return JSON.parse(jsonMatch[0]) as TaskDecompositionResult;
}

/**
 * 使用 AI 为任务安排日程
 */
export async function scheduleTasksWithAI(
  tasks: string[],
  startDate: string,
  constraints?: {
    hoursPerDay?: number;
    excludeDays?: string[];
    workdaysOnly?: boolean;
  }
): Promise<ScheduleResult> {
  const hoursPerDay = constraints?.hoursPerDay || 8;
  const excludeDays = constraints?.excludeDays?.join(', ') || '无';
  const workdaysOnly = constraints?.workdaysOnly !== false;

  const prompt = `你是一个日程规划专家。基于以下信息为任务制定详细的日程计划。

任务列表：
${tasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}

开始日期：${startDate}
每天工作小时数：${hoursPerDay}小时
排除的日期：${excludeDays}
仅工作日：${workdaysOnly}

请以 JSON 格式返回结果：
{
  "tasks": [
    {
      "task": "任务名称",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "priority": "high/medium/low",
      "notes": "备注"
    }
  ],
  "totalDays": 总天数,
  "notes": "整体规划建议"
}

要求：
1. 合理分配任务到各个工作日
2. 考虑任务优先级
3. 遵守每天工作小时数限制
4. 只返回 JSON，不要有其他文字`;

  const responseText = await callDeepSeek(prompt);

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法解析 AI 响应');
  }

  return JSON.parse(jsonMatch[0]) as ScheduleResult;
}
