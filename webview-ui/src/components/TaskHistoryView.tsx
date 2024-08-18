import React from 'react';
import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import { HistoryItem } from '../../../src/shared/HistoryItem';

interface TaskHistoryViewProps {
  taskHistory: HistoryItem[];
  onTaskResume: (taskId: string) => void;
  onTaskExport: (taskId: string) => void;
}

const TaskHistoryView: React.FC<TaskHistoryViewProps> = ({
  taskHistory,
  onTaskResume,
  onTaskExport,
}) => {
  return (
    <div className="task-history-view" style={{ padding: '0 20px' }}>
      <h2>Task History</h2>
      {taskHistory.map((task) => (
        <div key={task.id} className="task-item" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div>
              <h4>Excluded Files:</h4>
              <ul>
                {task.excludedFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Whitelisted Files:</h4>
              <ul>
                {task.whitelistedFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <VSCodeButton onClick={() => onTaskResume(task.id)}>Resume Task</VSCodeButton>
            <VSCodeButton onClick={() => onTaskExport(task.id)}>Export Task</VSCodeButton>
          </div>
          <VSCodeDivider style={{ marginTop: '20px' }} />
        </div>
      ))}
    </div>
  );
};

export default TaskHistoryView;