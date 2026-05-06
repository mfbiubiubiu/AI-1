'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, DatePicker, Input, InputNumber, Layout, List, Menu, Modal, Select, Space, Tabs, Tag, TimePicker, message } from 'antd';
import { BarsOutlined, CheckSquareOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useUser, SignInButton, UserButton, useClerk } from '@clerk/nextjs';
import { supabase } from '../lib/supabaseClient';
import dayjs, { Dayjs } from 'dayjs';
import { TaskDecomposition } from '@/components/TaskDecomposition';
import { enhanceTaskWithAI, RewriteMode } from '@/lib/aiService';
import { getUrgentTasks } from '@/lib/agent/gettask';
import { runTodoAgent } from '@/lib/agent/executor';

const { Sider, Header, Content } = Layout;
const { RangePicker } = TimePicker;

interface AvailabilitySlot {
  id: number;
  range: [Dayjs | null, Dayjs | null] | null;
}

interface RecommendedTask {
  todo: Todo;
  score: number;
  estimatedMinutes: number;
  reason: string;
}

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit',
    });
  }
};

const formatDeadline = (deadline: string | null) => {
  if (!deadline) return null;
  const date = new Date(deadline);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // 显示具体的日期时间，使用本地时区
  const localDateTime = date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffDays < 0) {
    return `Overdue: ${localDateTime}`;
  } else if (diffDays === 0) {
    return `Due today: ${localDateTime}`;
  } else if (diffDays === 1) {
    return `Due tomorrow: ${localDateTime}`;
  } else {
    return `Due in ${diffDays} days: ${localDateTime}`;
  }
};

const isOverdue = (deadline: string | null, isCompleted: boolean) => {
  if (!deadline || isCompleted) return false;
  return new Date(deadline) < new Date();
};

const parseEstimatedMinutes = (title: string, priority: '紧急' | '普通') => {
  const hourMatch = title.match(/\((\d+(?:\.\d+)?)h\)/i);
  if (hourMatch) {
    return Math.max(30, Math.round(Number(hourMatch[1]) * 60));
  }

  return priority === '紧急' ? 90 : 60;
};

const getDeadlineScore = (deadline: string | null) => {
  if (!deadline) return 0;

  const today = dayjs().startOf('day');
  const dueDate = dayjs(deadline).startOf('day');
  const diffDays = dueDate.diff(today, 'day');

  if (diffDays < 0) return 120;
  if (diffDays === 0) return 100;
  if (diffDays === 1) return 80;
  if (diffDays <= 3) return 50;
  if (diffDays <= 7) return 20;
  return 0;
};

const getRecommendationReason = (todo: Todo) => {
  if (isOverdue(todo.Deadline, todo.is_completed)) {
    return '已逾期，建议今天优先处理';
  }

  if (todo.Deadline) {
    const diffDays = dayjs(todo.Deadline).startOf('day').diff(dayjs().startOf('day'), 'day');
    if (diffDays === 0) return '今天到期，适合优先推进';
    if (diffDays === 1) return '明天到期，建议今天完成关键部分';
    if (diffDays <= 3) return '临近截止时间，适合提前处理';
  }

  if (todo.priority === '紧急') {
    return '任务标记为紧急，应优先安排';
  }

  return '任务时长较适中，适合填充今日空档';
};

const getRecommendedTasks = (todos: Todo[], slots: AvailabilitySlot[], maxTasks: number) => {
  const totalAvailableMinutes = slots.reduce((total, slot) => {
    if (!slot.range?.[0] || !slot.range?.[1]) return total;
    const minutes = slot.range[1].diff(slot.range[0], 'minute');
    return minutes > 0 ? total + minutes : total;
  }, 0);

  if (totalAvailableMinutes <= 0) {
    return { recommendations: [] as RecommendedTask[], totalAvailableMinutes };
  }

  const rankedTasks = todos
    .filter((todo) => !todo.is_completed)
    .map((todo) => {
      const estimatedMinutes = parseEstimatedMinutes(todo.title, todo.priority);
      const score =
        (todo.priority === '紧急' ? 80 : 40) +
        getDeadlineScore(todo.Deadline) +
        Math.max(0, 30 - Math.min(estimatedMinutes, 180) / 6);

      return {
        todo,
        score,
        estimatedMinutes,
        reason: getRecommendationReason(todo),
      };
    })
    .sort((left, right) => right.score - left.score);

  const recommendations: RecommendedTask[] = [];
  let usedMinutes = 0;

  for (const task of rankedTasks) {
    if (recommendations.length >= maxTasks) break;

    const fitsCurrentCapacity = usedMinutes + task.estimatedMinutes <= totalAvailableMinutes;
    const shouldForceFirstTask = recommendations.length === 0;

    if (fitsCurrentCapacity || shouldForceFirstTask) {
      recommendations.push(task);
      usedMinutes += fitsCurrentCapacity ? task.estimatedMinutes : 0;
    }
  }

  return { recommendations, totalAvailableMinutes };
};

interface Todo {
  id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  priority: '紧急' | '普通';
  created_at: string;
  Deadline: string | null;
}

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [priority, setPriority] = useState<'紧急' | '普通'>('普通');
  const [Deadline, setDeadline] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<'紧急' | '普通'>('普通');
  const [editDeadline, setEditDeadline] = useState<string | null>(null);
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [aiRewriteMode, setAiRewriteMode] = useState<RewriteMode | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [decomposeVisible, setDecomposeVisible] = useState(false);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好，我是你的 AI 待办助手。你可以问我：今天先做什么、有哪些紧急任务、如何安排任务顺序。',
    },
  ]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([
    { id: 1, range: [dayjs().hour(9).minute(0), dayjs().hour(11).minute(0)] },
    { id: 2, range: [dayjs().hour(14).minute(0), dayjs().hour(16).minute(0)] },
  ]);
  const [recommendationCount, setRecommendationCount] = useState(3);
  const visibleTodos = showUrgentOnly ? getUrgentTasks(todos) : todos;

  const { recommendations, totalAvailableMinutes } = getRecommendedTasks(
    todos,
    availabilitySlots,
    recommendationCount
  );

  const loadTodos = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setLoading(false);

    if (error) {
      message.error('加载任务失败');
      console.error(error);
      return;
    }

    setTodos(data || []);
  };

  useEffect(() => {
    if (isLoaded && user) {
      loadTodos();
    }

    if (isLoaded && !user) {
      setTodos([]);
    }
  }, [isLoaded, user]);

  const addTodo = async () => {
    const title = inputValue.trim();
    if (!title || !user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id,
        title,
        is_completed: false,
        priority,
        Deadline,
      })
      .select()
      .single();
    setLoading(false);

    if (error || !data) {
      message.error('创建任务失败');
      console.error(error);
      return;
    }

    setTodos([data, ...todos]);
    setInputValue('');
    setPriority('普通');
    setDeadline(null);
    message.success('创建成功');
  };

  const toggleTodo = async (id: string) => {
    if (!user) return;

    const current = todos.find(todo => todo.id === id);
    if (!current) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('todos')
      .update({ is_completed: !current.is_completed })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    setLoading(false);

    if (error || !data) {
      message.error('更新任务失败');
      console.error(error);
      return;
    }

    setTodos(todos.map(todo => todo.id === id ? data : todo));
  };

  const deleteTodo = (id: string) => {
    setDeleteId(id);
  };

  const openEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setEditTitle(todo.title);
    setEditPriority(todo.priority);
    setEditDeadline(todo.Deadline);
    setAiRewriteMode(undefined);
  };

  const handleConfirmEdit = async () => {
    if (!editingTodo || !user) {
      setEditingTodo(null);
      return;
    }

    const title = editTitle.trim();
    if (!title) {
      message.warning('任务标题不能为空');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('todos')
      .update({
        title,
        priority: editPriority,
        Deadline: editDeadline,
      })
      .eq('id', editingTodo.id)
      .eq('user_id', user.id)
      .select()
      .single();
    setLoading(false);

    if (error || !data) {
      message.error('更新任务失败');
      console.error(error);
      return;
    }

    setTodos(todos.map((todo) => (todo.id === editingTodo.id ? data : todo)));
    setEditingTodo(null);
    message.success('更新成功');
  };

  const handleCancelEdit = () => {
    setEditingTodo(null);
    setAiRewriteMode(undefined);
  };

  const handleEnhanceEditTitle = async (mode: RewriteMode) => {
    const title = editTitle.trim();
    if (!title) {
      message.warning('请先输入任务标题');
      return;
    }

    try {
      setAiEnhancing(true);
      const enhancedTitle = await enhanceTaskWithAI(title, editPriority, mode);
      if (!enhancedTitle) {
        message.warning('AI 未返回有效结果，请重试');
        return;
      }
      setEditTitle(enhancedTitle);
      message.success(mode === 'short' ? 'AI 已简写任务描述' : 'AI 已详写任务描述');
    } catch (error) {
      console.error(error);
      message.error('AI 重写失败，请稍后重试');
    } finally {
      setAiEnhancing(false);
      setAiRewriteMode(undefined);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId || !user) {
      setDeleteId(null);
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', deleteId)
      .eq('user_id', user.id);
    setLoading(false);

    if (error) {
      message.error('删除任务失败');
      console.error(error);
      setDeleteId(null);
      return;
    }

    setTodos(todos.filter(todo => todo.id !== deleteId));
    setDeleteId(null);
    message.success('删除成功');
  };

  const handleCancelDelete = () => {
    setDeleteId(null);
  };

  const handleTasksGenerated = async (subTasks: any[]) => {
    if (!user) return;
    
    // 批量添加生成的子任务
    for (const task of subTasks) {
      const { data, error } = await supabase
        .from('todos')
        .insert({
          user_id: user.id,
          title: `${task.title} (${task.estimatedHours}h)`,
          is_completed: false,
          priority: task.priority === 'high' ? '紧急' : '普通',
          Deadline: null,
        })
        .select()
        .single();

      if (data) {
        setTodos(prevTodos => [data, ...prevTodos]);
      }
    }
    message.success(`成功导入 ${subTasks.length} 个子任务！`);
  };

  const handleSlotChange = (slotId: number, value: [Dayjs | null, Dayjs | null] | null) => {
    setAvailabilitySlots((currentSlots) =>
      currentSlots.map((slot) => (slot.id === slotId ? { ...slot, range: value } : slot))
    );
  };

  const addAvailabilitySlot = () => {
    setAvailabilitySlots((currentSlots) => [
      ...currentSlots,
      { id: Date.now(), range: null },
    ]);
  };

  const removeAvailabilitySlot = (slotId: number) => {
    setAvailabilitySlots((currentSlots) => currentSlots.filter((slot) => slot.id !== slotId));
  };

  const sendAssistantMessage = async () => {
    const content = assistantInput.trim();
    if (!content) return;

    const userMessage: AssistantMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content,
    };

    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantInput('');
    setAssistantLoading(true);

    try {
      const response = await runTodoAgent(
        content,
        todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          priority: todo.priority,
          is_completed: todo.is_completed,
        }))
      );

      const assistantMessage: AssistantMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: response || '我暂时没有生成有效回复，请稍后再试。',
      };
      setAssistantMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.error(error);
      setAssistantMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          content: '抱歉，我现在有点忙，请稍后重试。',
        },
      ]);
      message.error('AI 助手调用失败');
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider style={{ background: '#001529' }}>
        <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', textAlign: 'center', padding: '20px 0' }}>
          TO-DO-LIST
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['1']}
          items={[
            {
              key: '1',
              icon: <CheckSquareOutlined />,
              label: '我的任务',
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {user ? (
            <Space>
              <span>欢迎, {user.firstName || user.username}!</span>
              <Button onClick={() => signOut({ redirectUrl: '/' })}>登出</Button>
            </Space>
          ) : (
            <SignInButton mode="modal">
              <Button type="primary">登录</Button>
            </SignInButton>
          )}
        </Header>
        <Content style={{ background: '#e6f7ff', padding: '20px' }}>
          {user ? (
            <div style={{ maxWidth: 800, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>我的任务</h1>
                <Space>
                  <Button
                    type="primary"
                    icon={<BarsOutlined />}
                    onClick={() => setDecomposeVisible(true)}
                  >
                    任务分解
                  </Button>
                  <Button
                    onClick={() => setShowUrgentOnly((current) => !current)}
                  >
                    {showUrgentOnly ? '显示全部任务' : '显示紧急任务'}
                  </Button>
                  <Button type="dashed" onClick={() => setAssistantVisible(true)}>
                    AI助手
                  </Button>

                </Space>
              </div>
              <Space style={{ width: '100%', marginBottom: 20 }}>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onPressEnter={addTodo}
                  placeholder="想做点什么？"
                  style={{ flex: 1 }}
                />
                <Select
                  value={priority}
                  onChange={(val) => setPriority(val)}
                  style={{ width: 100 }}
                  options={[
                    { label: '普通', value: '普通' },
                    { label: '紧急', value: '紧急' },
                  ]}
                />
                <DatePicker
                  placeholder="Deadline"
                  onChange={(date) => setDeadline(date ? date.format('YYYY-MM-DD') : null)}
                  value={Deadline ? dayjs(Deadline) : null}
                  style={{ width: 150 }}
                />
                <Button type="primary" onClick={addTodo}>添加</Button>
              </Space>
              <Card
                title="今天先做什么"
                size="small"
                style={{ marginBottom: '20px' }}
                extra={
                  <Space>
                    <span>推荐数量</span>
                    <InputNumber
                      min={1}
                      max={5}
                      value={recommendationCount}
                      onChange={(value) => setRecommendationCount(value ?? 3)}
                    />
                  </Space>
                }
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Alert
                    type="info"
                    showIcon
                    message={`今日可用空档约 ${Math.floor(totalAvailableMinutes / 60)} 小时 ${totalAvailableMinutes % 60} 分钟`}
                    description="系统会综合任务紧急程度、截止时间和可用时长，自动推荐今天优先处理的任务。"
                  />
                  {availabilitySlots.map((slot, index) => (
                    <Space key={slot.id} style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Space>
                        <ClockCircleOutlined />
                        <span>空档 {index + 1}</span>
                        <RangePicker
                          format="HH:mm"
                          minuteStep={15}
                          value={slot.range}
                          onChange={(value) => handleSlotChange(slot.id, value)}
                        />
                      </Space>
                      <Button
                        danger
                        type="text"
                        onClick={() => removeAvailabilitySlot(slot.id)}
                        disabled={availabilitySlots.length === 1}
                      >
                        删除
                      </Button>
                    </Space>
                  ))}
                  <Space>
                    <Button onClick={addAvailabilitySlot}>新增空档</Button>
                  </Space>
                  {recommendations.length > 0 ? (
                    <List
                      dataSource={recommendations}
                      renderItem={(item, index) => (
                        <List.Item>
                          <Space direction="vertical" style={{ width: '100%' }} size={4}>
                            <Space wrap>
                              <Tag color="blue">推荐 {index + 1}</Tag>
                              <Tag color={item.todo.priority === '紧急' ? 'red' : 'default'}>
                                {item.todo.priority}
                              </Tag>
                              <Tag>{Math.floor(item.estimatedMinutes / 60)}h {item.estimatedMinutes % 60}m</Tag>
                              {item.todo.Deadline && <Tag color="gold">{formatDeadline(item.todo.Deadline)}</Tag>}
                            </Space>
                            <strong>{item.todo.title}</strong>
                            <span style={{ color: '#666' }}>{item.reason}</span>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      message="还无法生成今日推荐"
                      description="请先添加未完成任务，并至少填写一个有效的今日空档时间段。"
                    />
                  )}
                </Space>
              </Card>
              <Tabs
                defaultActiveKey="1"
                items={[
                  {
                    key: '1',
                    label: '未完成',
                    children: (
                      <List
                        dataSource={visibleTodos.filter(todo => !todo.is_completed)}
                        loading={loading}
                        renderItem={(todo) => (
                          <List.Item
                            actions={[
                              <Button
                                key="edit"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openEditTodo(todo);
                                }}
                              />,
                              <Button
                                key="delete"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  deleteTodo(todo.id);
                                }}
                              />
                            ]}
                          >
                            <Checkbox
                              checked={todo.is_completed}
                              onChange={() => toggleTodo(todo.id)}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ textDecoration: todo.is_completed ? 'line-through' : 'none', color: todo.is_completed ? 'gray' : (isOverdue(todo.Deadline, todo.is_completed) ? 'red' : 'inherit') }}>
                                  {todo.title} <span style={{ color: todo.priority === '紧急' ? 'red' : 'gray', fontSize: '12px' }}>({todo.priority})</span>
                                </span>
                                {formatDeadline(todo.Deadline) && (
                                  <span style={{ fontSize: '12px', color: '#999' }}>
                                    {formatDeadline(todo.Deadline)}
                                  </span>
                                )}
                                <span style={{ fontSize: '12px', color: '#999' }}>
                                  {formatRelativeTime(todo.created_at)}
                                </span>
                              </div>
                            </Checkbox>
                          </List.Item>
                        )}
                      />
                    ),
                  },
                  {
                    key: '2',
                    label: '已完成',
                    children: (
                      <List
                        dataSource={visibleTodos.filter(todo => todo.is_completed)}
                        loading={loading}
                        renderItem={(todo) => (
                          <List.Item
                            actions={[
                              <Button
                                key="edit"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openEditTodo(todo);
                                }}
                              />,
                              <Button
                                key="delete"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  deleteTodo(todo.id);
                                }}
                              />
                            ]}
                          >
                            <Checkbox
                              checked={todo.is_completed}
                              onChange={() => toggleTodo(todo.id)}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ textDecoration: todo.is_completed ? 'line-through' : 'none', color: todo.is_completed ? 'gray' : 'inherit' }}>
                                  {todo.title} <span style={{ color: todo.priority === '紧急' ? 'red' : 'gray', fontSize: '12px' }}>({todo.priority})</span>
                                </span>
                                {formatDeadline(todo.Deadline) && (
                                  <span style={{ fontSize: '12px', color: '#999' }}>
                                    {formatDeadline(todo.Deadline)}
                                  </span>
                                )}
                                <span style={{ fontSize: '12px', color: '#999' }}>
                                  {formatRelativeTime(todo.created_at)}
                                </span>
                              </div>
                            </Checkbox>
                          </List.Item>
                        )}
                      />
                    ),
                  },
                ]}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <h1>欢迎使用 To Do App</h1>
              <p>请登录以管理您的任务</p>
            </div>
          )}
        </Content>
      </Layout>
      <Modal
        title="编辑任务"
        open={editingTodo !== null}
        okText="保存"
        cancelText="取消"
        onOk={handleConfirmEdit}
        onCancel={handleCancelEdit}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="任务标题"
          />
          <Space style={{ width: '100%' }} align="start">
            <Select
              style={{ flex: 1 }}
              value={editPriority}
              onChange={(val) => setEditPriority(val)}
              options={[
                { label: '普通', value: '普通' },
                { label: '紧急', value: '紧急' },
              ]}
            />
            <Select<RewriteMode>
              style={{ width: 140 }}
              placeholder="AI重写"
              value={aiRewriteMode}
              loading={aiEnhancing}
              disabled={aiEnhancing}
              onChange={(value) => {
                setAiRewriteMode(value);
                handleEnhanceEditTitle(value);
              }}
              options={[
                { label: 'AI简写', value: 'short' },
                { label: 'AI详写', value: 'detailed' },
              ]}
            />
          </Space>
          <DatePicker
            placeholder="Deadline"
            onChange={(date) => setEditDeadline(date ? date.format('YYYY-MM-DD') : null)}
            value={editDeadline ? dayjs(editDeadline) : null}
            style={{ width: '100%' }}
          />
        </Space>
      </Modal>
      <Modal
        title="确认删除"
        open={deleteId !== null}
        okText="确定"
        cancelText="取消"
        okType="danger"
        onOk={handleConfirmDelete}
        onCancel={handleCancelDelete}
      >
        <p>确定要删除这个任务吗？</p>
      </Modal>
      <TaskDecomposition
        visible={decomposeVisible}
        onClose={() => setDecomposeVisible(false)}
        onTasksGenerated={handleTasksGenerated}
      />
      <Modal
        title="AI助手"
        open={assistantVisible}
        onCancel={() => setAssistantVisible(false)}
        footer={null}
        width={720}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 12,
              minHeight: 320,
              maxHeight: 420,
              overflowY: 'auto',
              background: '#fafafa',
            }}
          >
            <List
              dataSource={assistantMessages}
              renderItem={(item) => (
                <List.Item style={{ display: 'block', border: 'none', padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        whiteSpace: 'pre-wrap',
                        background: item.role === 'user' ? '#1677ff' : '#ffffff',
                        color: item.role === 'user' ? '#fff' : '#111827',
                        border: item.role === 'user' ? 'none' : '1px solid #e5e7eb',
                      }}
                    >
                      {item.content}
                    </div>
                  </div>
                </List.Item>
              )}
            />
            {assistantLoading && (
              <div style={{ color: '#6b7280', fontSize: 13 }}>AI 正在思考...</div>
            )}
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={assistantInput}
              onChange={(e) => setAssistantInput(e.target.value)}
              onPressEnter={sendAssistantMessage}
              placeholder="输入你想问的问题，例如：帮我列出现在最紧急的任务"
              disabled={assistantLoading}
            />
            <Button type="primary" onClick={sendAssistantMessage} loading={assistantLoading}>
              发送
            </Button>
          </Space.Compact>
        </Space>
      </Modal>
    </Layout>
  );
}
