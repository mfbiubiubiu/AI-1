export interface TaskWithPriority {
  priority: '紧急' | '普通';
}

export const getUrgentTasks = <T extends TaskWithPriority>(tasks: T[]): T[] => {
  return tasks.filter((task) => task.priority === '紧急');
};