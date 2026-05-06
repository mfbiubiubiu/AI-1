import { getUrgentTasks, TaskWithPriority } from './gettask';
import { callAgentModel } from './client';
import { AGENT_SYSTEM_PROMPT, buildAgentUserPrompt } from './prompts';

export interface AgentTodoTask extends TaskWithPriority {
	id: string;
	title: string;
	is_completed: boolean;
}

export type ParsedAction =
	| {
			type: 'tool';
			name: 'get_urgent_tasks';
		}
	| {
			type: 'finish';
			answer: string;
		};

const ACTION_LINE_REGEX = /^Action:\s*(.+)$/im;
const TOOL_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/;
const FINISH_REGEX = /^Finish\[(.*)\]$/;
const THOUGHT_ACTION_BLOCK_REGEX = /(Thought:[\s\S]*?Action:[\s\S]*?)(?=\n\s*(?:Thought:|Action:|Observation:)|\Z)/i;

export function parseAgentAction(modelOutput: string): ParsedAction {
	const actionLine = modelOutput.match(ACTION_LINE_REGEX)?.[1]?.trim();

	if (!actionLine) {
		throw new Error('Agent 输出缺少 Action 行');
	}

	const finishMatch = actionLine.match(FINISH_REGEX);
	if (finishMatch) {
		return {
			type: 'finish',
			answer: finishMatch[1].trim(),
		};
	}

	const toolMatch = actionLine.match(TOOL_REGEX);
	if (!toolMatch) {
		throw new Error(`无法解析 Action: ${actionLine}`);
	}

	const toolName = toolMatch[1];
	if (toolName !== 'get_urgent_tasks') {
		throw new Error(`不支持的工具: ${toolName}`);
	}

	return {
		type: 'tool',
		name: 'get_urgent_tasks',
	};
}

export function executeToolAction(action: ParsedAction, tasks: AgentTodoTask[]): string {
	if (action.type === 'finish') {
		return action.answer;
	}

	const urgentTasks = getUrgentTasks(tasks).filter((task) => !task.is_completed);

	if (urgentTasks.length === 0) {
		return '没有未完成的紧急任务。';
	}

	return urgentTasks
		.map((task, index) => `${index + 1}. ${task.title}`)
		.join('\n');
}

export interface AgentLoopStep {
	iteration: number;
	llmOutput: string;
	observation?: string;
}

export interface AgentLoopResult {
	finalAnswer: string;
	steps: AgentLoopStep[];
	promptHistory: string[];
}

function truncateThoughtActionPair(llmOutput: string): string {
	const match = llmOutput.match(THOUGHT_ACTION_BLOCK_REGEX);
	if (!match) {
		return llmOutput.trim();
	}

	return match[1].trim();
}

function parseActionFromOutput(llmOutput: string): string | null {
	const actionMatch = llmOutput.match(/Action:\s*([\s\S]*)$/i);
	return actionMatch?.[1]?.trim() ?? null;
}

function parseToolNameAndArgs(actionStr: string): { toolName: string; kwargs: Record<string, string> } | null {
	const toolName = actionStr.match(/(\w+)\(/)?.[1];
	const argsStr = actionStr.match(/\(([\s\S]*)\)/)?.[1] ?? '';

	if (!toolName) {
		return null;
	}

	const kwargs: Record<string, string> = {};
	for (const item of argsStr.matchAll(/(\w+)="([^"]*)"/g)) {
		kwargs[item[1]] = item[2];
	}

	return { toolName, kwargs };
}

function runToolByName(toolName: string, tasks: AgentTodoTask[], _kwargs: Record<string, string>): string {
	if (toolName !== 'get_urgent_tasks') {
		return `错误:未定义的工具 '${toolName}'`;
	}

	const urgentTasks = getUrgentTasks(tasks).filter((task) => !task.is_completed);
	if (urgentTasks.length === 0) {
		return '没有未完成的紧急任务。';
	}

	return urgentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n');
}

export async function runTodoAgentLoop(
	userRequest: string,
	tasks: AgentTodoTask[],
	maxIterations = 5
): Promise<AgentLoopResult> {
	const promptHistory = [buildAgentUserPrompt(userRequest, tasks)];
	const steps: AgentLoopStep[] = [];

	for (let i = 0; i < maxIterations; i += 1) {
		const fullPrompt = promptHistory.join('\n');
		const rawOutput = await callAgentModel([
			{ role: 'system', content: AGENT_SYSTEM_PROMPT },
			{ role: 'user', content: fullPrompt },
		]);

		const llmOutput = truncateThoughtActionPair(rawOutput);
		promptHistory.push(llmOutput);

		const step: AgentLoopStep = {
			iteration: i + 1,
			llmOutput,
		};

		const actionStr = parseActionFromOutput(llmOutput);
		if (!actionStr) {
			const observation =
				"错误: 未能解析到 Action 字段。请确保你的回复严格遵循 'Thought: ... Action: ...' 的格式。";
			const observationStr = `Observation: ${observation}`;
			step.observation = observationStr;
			steps.push(step);
			promptHistory.push(observationStr);
			continue;
		}

		const finishMatch = actionStr.match(/^Finish\[([\s\S]*)\]$/);
		if (finishMatch) {
			steps.push(step);
			return {
				finalAnswer: finishMatch[1].trim(),
				steps,
				promptHistory,
			};
		}

		const parsedTool = parseToolNameAndArgs(actionStr);
		if (!parsedTool) {
			const observationStr = 'Observation: 错误: Action 不是合法的工具调用。';
			step.observation = observationStr;
			steps.push(step);
			promptHistory.push(observationStr);
			continue;
		}

		const observation = runToolByName(parsedTool.toolName, tasks, parsedTool.kwargs);
		const observationStr = `Observation: ${observation}`;
		step.observation = observationStr;
		steps.push(step);
		promptHistory.push(observationStr);
	}

	return {
		finalAnswer: '错误: 已达到最大循环次数，仍未得到最终答案。',
		steps,
		promptHistory,
	};
}

export async function runTodoAgent(userRequest: string, tasks: AgentTodoTask[]): Promise<string> {
	const result = await runTodoAgentLoop(userRequest, tasks, 5);
	return result.finalAnswer;
}

