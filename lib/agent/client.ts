const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-chat';

export interface AgentMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface ChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
}

export class OpenAICompatibleClient {
	private readonly model: string;
	private readonly apiKey: string;
	private readonly baseUrl: string;

	constructor(model: string, apiKey: string, baseUrl: string) {
		this.model = model;
		this.apiKey = apiKey;
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	async generate(prompt: string, systemPrompt: string): Promise<string> {
		console.log('正在调用大语言模型...');

		try {
			const messages: AgentMessage[] = [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: prompt },
			];

			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages,
					stream: false,
				}),
			});

			if (!response.ok) {
				const err = await response.text();
				throw new Error(`请求失败 ${response.status}: ${err}`);
			}

			const data = (await response.json()) as ChatCompletionResponse;
			const answer = data.choices?.[0]?.message?.content;

			if (!answer) {
				throw new Error('模型返回内容为空');
			}

			console.log('大语言模型响应成功。');
			return answer;
		} catch (e) {
			console.error('调用LLM API时发生错误:', e);
			return '错误:调用语言模型服务时出错。';
		}
	}
}

export async function callAgentModel(messages: AgentMessage[]): Promise<string> {
	if (!apiKey) {
		throw new Error('NEXT_PUBLIC_DEEPSEEK_API_KEY is not set in environment variables');
	}

	if (messages.length === 0) {
		throw new Error('messages 不能为空');
	}

	const systemMessage = messages.find((message) => message.role === 'system');
	const nonSystemMessages = messages.filter((message) => message.role !== 'system');
	const prompt = nonSystemMessages.map((message) => `${message.role}: ${message.content}`).join('\n\n');

	const client = new OpenAICompatibleClient(DEEPSEEK_MODEL, apiKey, DEEPSEEK_BASE_URL);
	return client.generate(prompt, systemMessage?.content ?? '你是一个智能助手。');
}
