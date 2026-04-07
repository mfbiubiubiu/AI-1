'use client';

import { useEffect, useState } from 'react';
import { Input, Button, List, Checkbox, Space, Layout, Menu, Tabs, Modal, message, Select, DatePicker } from 'antd';
import { DeleteOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { useUser, SignInButton, UserButton, useClerk } from '@clerk/nextjs';
import { supabase } from '../lib/supabaseClient';
import dayjs from 'dayjs';

const { Sider, Header, Content } = Layout;

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

interface Todo {
  id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  priority: '紧急' | '普通';
  created_at: string;
  Deadline: string | null;
}

export default function Home() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [priority, setPriority] = useState<'紧急' | '普通'>('普通');
  const [Deadline, setDeadline] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
              <h1>我的任务</h1>
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
                  onChange={(date, dateString) => setDeadline(dateString || null)}
                  value={Deadline ? dayjs(Deadline) : null}
                  style={{ width: 150 }}
                />
                <Button type="primary" onClick={addTodo}>添加</Button>
              </Space>
              <Tabs
                defaultActiveKey="1"
                items={[
                  {
                    key: '1',
                    label: '未完成',
                    children: (
                      <List
                        dataSource={todos.filter(todo => !todo.is_completed)}
                        loading={loading}
                        renderItem={(todo) => (
                          <List.Item
                            actions={[
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
                        dataSource={todos.filter(todo => todo.is_completed)}
                        loading={loading}
                        renderItem={(todo) => (
                          <List.Item
                            actions={[
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
    </Layout>
  );
}
