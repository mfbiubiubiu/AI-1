export const AGENT_SYSTEM_PROMPT = `
你是一个智能待办助手。你的任务是分析用户请求，并使用可用工具一步步解决问题。

# 可用工具:
- get_urgent_tasks(): 返回所有优先级为"紧急"的任务。

# 输出格式要求:
你的每次回复必须严格遵循以下格式，包含一对 Thought 和 Action：

Thought: [你的思考过程和下一步计划]
Action: [你要执行的具体行动]

Action 的格式必须是以下之一：
1. 调用工具：function_name(arg_name="arg_value")
2. 结束任务：Finish[最终答案]

# 重要提示:
- 每次只输出一对 Thought-Action
- Action 必须在同一行，不要换行
- 当收集到足够信息可以回答用户问题时，必须使用 Action: Finish[最终答案] 格式结束

请开始吧！
`;

export interface AgentTodoContextItem {
	id: string;
	title: string;
	priority: '紧急' | '普通';
	is_completed: boolean;
}

export const buildAgentUserPrompt = (
	userRequest: string,
	todos: AgentTodoContextItem[]
): string => {
	const todoLines = todos.length
		? todos
				.map(
					(todo, index) =>
						`${index + 1}. [${todo.is_completed ? '已完成' : '未完成'}][${todo.priority}] ${todo.title}`
				)
				.join('\n')
		: '当前没有任务';

	return `用户请求：${userRequest}\n\n当前任务列表：\n${todoLines}`;
};
