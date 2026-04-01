'use client';

import { useState } from 'react';
import { Input, Button, List, Checkbox, Space, Layout, Menu, Avatar, Tabs, Modal, message } from 'antd';
import { DeleteOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { useUser, SignInButton, UserButton } from '@clerk/nextjs';

const { Sider, Header, Content } = Layout;

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  priority: '紧急' | '普通';
}

export default function Home() {
  const { user } = useUser();
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: '完成项目报告', completed: false, priority: '紧急' },
    { id: 2, text: '回复邮件', completed: true, priority: '普通' },
    { id: 3, text: '准备会议资料', completed: false, priority: '紧急' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const addTodo = () => {
    if (inputValue.trim()) {
      const newTodo: Todo = {
        id: Date.now(),
        text: inputValue.trim(),
        completed: false,
        priority: '普通',
      };
      setTodos([newTodo, ...todos]);
      setInputValue('');
    }
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id: number) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      setTodos(todos.filter(todo => todo.id !== deleteId));
      message.success({
        content: '删除成功',
        duration: 2,
        top: 60,
      });
      setDeleteId(null);
    }
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
          {user ? <UserButton /> : <SignInButton mode="modal"><Button type="primary">登录</Button></SignInButton>}
        </Header>
        <Content style={{ background: '#e6f7ff', padding: '20px' }}>
          {user ? (
            <div style={{ maxWidth: 800, margin: '0 auto' }}>
              <h1>我的任务</h1>
              <Space.Compact style={{ width: '100%', marginBottom: 20 }}>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onPressEnter={addTodo}
                  placeholder="想做点什么？"
                />
                <Button type="primary" onClick={addTodo}>添加</Button>
              </Space.Compact>
              <Tabs
                defaultActiveKey="1"
                items={[
                  {
                    key: '1',
                    label: '未完成',
                    children: (
                      <List
                        dataSource={todos.filter(todo => !todo.completed)}
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
                              checked={todo.completed}
                              onChange={() => toggleTodo(todo.id)}
                            >
                              <span style={{ textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? 'gray' : 'inherit' }}>
                                {todo.text} <span style={{ color: todo.priority === '紧急' ? 'red' : 'gray', fontSize: '12px' }}>({todo.priority})</span>
                              </span>
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
                        dataSource={todos.filter(todo => todo.completed)}
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
                              checked={todo.completed}
                              onChange={() => toggleTodo(todo.id)}
                            >
                              <span style={{ textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? 'gray' : 'inherit' }}>
                                {todo.text} <span style={{ color: todo.priority === '紧急' ? 'red' : 'gray', fontSize: '12px' }}>({todo.priority})</span>
                              </span>
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