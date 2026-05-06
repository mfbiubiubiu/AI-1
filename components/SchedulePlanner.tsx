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
  DatePicker,
  Table,
  Space,
  Tag,
  InputNumber,
  Checkbox,
  List,
} from 'antd';
import dayjs from 'dayjs';
import { scheduleTasksWithAI, ScheduleResult } from '@/lib/aiService';

interface SchedulePlannerProps {
  visible: boolean;
  selectedTasks: string[]; // 已选中的任务列表
  onClose: () => void;
  onScheduleGenerated?: (schedule: ScheduleResult) => void;
}

export const SchedulePlanner: React.FC<SchedulePlannerProps> = ({
  visible,
  selectedTasks,
  onClose,
  onScheduleGenerated,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const handleSchedule = async (values: any) => {
    try {
      setLoading(true);
      message.loading('AI 正在规划日程...', 0);

      const excludeDays = values.excludeDates
        ? values.excludeDates.map((date: any) => date.format('YYYY-MM-DD'))
        : [];

      const schedule = await scheduleTasksWithAI(selectedTasks, values.startDate.format('YYYY-MM-DD'), {
        hoursPerDay: values.hoursPerDay || 8,
        excludeDays: excludeDays,
        workdaysOnly: values.workdaysOnly !== false,
      });

      setResult(schedule);
      message.destroy();
      message.success('日程规划完成！');
    } catch (error) {
      message.error('日程规划失败: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (result && onScheduleGenerated) {
      onScheduleGenerated(result);
      form.resetFields();
      setResult(null);
      onClose();
    }
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '任务',
      dataIndex: 'task',
      key: 'task',
      width: 250,
    },
    {
      title: '时间',
      key: 'time',
      width: 120,
      render: (_: any, record: any) => `${record.startTime} - ${record.endTime}`,
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
  ];

  return (
    <Modal
      title="AI 日程规划工具"
      open={visible}
      onCancel={() => {
        form.resetFields();
        setResult(null);
        onClose();
      }}
      width={900}
      footer={null}
    >
      {!result ? (
        <Form form={form} onFinish={handleSchedule} layout="vertical">
          <Card
            title="选中的任务"
            size="small"
            type="inner"
            style={{ marginBottom: '16px' }}
          >
            {selectedTasks.length > 0 ? (
              <List
                dataSource={selectedTasks}
                renderItem={(task) => <List.Item>{task}</List.Item>}
              />
            ) : (
              <p style={{ color: '#999' }}>未选中任何任务，请先选择任务</p>
            )}
          </Card>

          <Form.Item
            label="开始日期"
            name="startDate"
            rules={[{ required: true, message: '请选择开始日期' }]}
            initialValue={dayjs()}
          >
            <DatePicker />
          </Form.Item>

          <Form.Item
            label="每天工作小时数"
            name="hoursPerDay"
            initialValue={8}
          >
            <InputNumber min={1} max={16} />
          </Form.Item>

          <Form.Item
            name="workdaysOnly"
            valuePropName="checked"
            initialValue={true}
          >
            <Checkbox>仅限工作日 (周一-周五)</Checkbox>
          </Form.Item>

          <Form.Item
            label="排除的日期 (可选)"
            name="excludeDates"
          >
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              placeholder={['开始日期', '结束日期']}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            disabled={selectedTasks.length === 0}
          >
            {loading ? '规划中...' : '生成日程'}
          </Button>
        </Form>
      ) : (
        <div className="space-y-4">
          <Card
            title="规划概览"
            size="small"
            type="inner"
            style={{ marginBottom: '16px' }}
          >
            <p>
              <strong>总耗时: </strong>
              {result.totalDays} 天
            </p>
            <p>
              <strong>规划建议:</strong>
            </p>
            <p style={{ marginLeft: '20px' }}>{result.notes}</p>
          </Card>

          <Card
            title={`详细日程 (共 ${result.tasks.length} 项)`}
            size="small"
            type="inner"
            style={{ marginBottom: '16px' }}
          >
            <Table
              columns={columns}
              dataSource={result.tasks.map((task: any, index: number) => ({
                key: index,
                ...task,
              }))}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </Card>

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              onClick={() => {
                form.resetFields();
                setResult(null);
              }}
            >
              重新规划
            </Button>
            <Button type="primary" onClick={handleConfirm}>
              确认并保存
            </Button>
          </Space>
        </div>
      )}
    </Modal>
  );
};
