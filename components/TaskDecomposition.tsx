'use client';

import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Spin,
  message,
  Card,
  Tag,
  Collapse,
  Space,
  Table,
  Progress,
} from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { decomposeTask, TaskDecompositionResult } from '@/lib/aiService';

interface TaskDecompositionProps {
  visible: boolean;
  onClose: () => void;
  onTasksGenerated?: (subTasks: any[]) => void;
}

export const TaskDecomposition: React.FC<TaskDecompositionProps> = ({
  visible,
  onClose,
  onTasksGenerated,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TaskDecompositionResult | null>(null);

  const handleDecompose = async (values: { mainTask: string }) => {
    try {
      setLoading(true);
      message.loading('AI 正在分析任务...', 0);
      const decomposed = await decomposeTask(values.mainTask);
      setResult(decomposed);
      message.destroy();
      message.success('任务分解完成！');
    } catch (error) {
      message.error('任务分解失败: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (result && onTasksGenerated) {
      onTasksGenerated(result.subTasks);
      form.resetFields();
      setResult(null);
      onClose();
    }
  };

  const columns = [
    {
      title: '子任务',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: string) => {
        const colorMap: Record<string, string> = {
          high: 'red',
          medium: 'orange',
          low: 'green',
        };
        return <Tag color={colorMap[priority]}>{priority}</Tag>;
      },
    },
    {
      title: '预计时长(小时)',
      dataIndex: 'estimatedHours',
      key: 'estimatedHours',
      width: 120,
      render: (hours: number) => `${hours}h`,
    },
  ];

  return (
    <Modal
      title="AI 任务分解工具"
      open={visible}
      onCancel={() => {
        form.resetFields();
        setResult(null);
        onClose();
      }}
      width={800}
      footer={null}
    >
      {!result ? (
        <Form form={form} onFinish={handleDecompose} layout="vertical">
          <Form.Item
            label="输入大任务"
            name="mainTask"
            rules={[{ required: true, message: '请输入任务描述' }]}
          >
            <Input.TextArea
              placeholder="例如：开发一个电商平台的购物车功能"
              rows={4}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
          >
            {loading ? '分析中...' : '分解任务'}
          </Button>
        </Form>
      ) : (
        <div className="space-y-4">
          <Card
            title="原始任务"
            size="small"
            type="inner"
            style={{ marginBottom: '16px' }}
          >
            <p>{result.mainTask}</p>
          </Card>

          <Card
            title="实施方法"
            size="small"
            type="inner"
            style={{ marginBottom: '16px' }}
          >
            <p>{result.recommendedApproach}</p>
          </Card>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>总估计时长: {result.totalEstimatedHours} 小时</strong>
            </div>
            <Progress
              percent={100}
              format={() => `${result.totalEstimatedHours}h`}
            />
          </div>

          <Card
            title={`子任务列表 (共 ${result.subTasks.length} 个)`}
            size="small"
            type="inner"
            style={{ marginBottom: '16px' }}
          >
            <Table
              columns={columns}
              dataSource={result.subTasks.map((task: any, index: number) => ({
                key: index,
                ...task,
              }))}
              pagination={false}
              size="small"
            />

            {result.subTasks.length > 0 && (
              <Collapse
                style={{ marginTop: '16px' }}
                items={result.subTasks.map((task: any, index: number) => ({
                  key: index,
                  label: `${task.title} - 详细描述`,
                  children: (
                    <div>
                      <p>
                        <strong>描述:</strong> {task.description}
                      </p>
                      {task.dependencies.length > 0 && (
                        <p>
                          <strong>依赖任务:</strong>{' '}
                          {task.dependencies.join(', ')}
                        </p>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              onClick={() => {
                form.resetFields();
                setResult(null);
              }}
            >
              重新分解
            </Button>
            <Button type="primary" onClick={handleConfirm}>
              导入至任务列表
            </Button>
          </Space>
        </div>
      )}
    </Modal>
  );
};
