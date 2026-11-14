import React, { useState, useEffect, useRef } from 'react';
import { wsClient } from '../services/websocket';
import { X, Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface DevToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevToolsPanel: React.FC<DevToolsPanelProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<any[]>(() => wsClient.getLogs());
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = wsClient.onLog(() => {
      setLogs([...wsClient.getLogs()]);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleClear = () => {
    wsClient.getLogs().length = 0;
    setLogs([]);
  };

  return (
    <div className="devtools-drawer">
      <div className="devtools-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>⚡ WebSocket Live Traffic Inspector</span>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>({logs.length} frames captured)</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleClear}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Clear logs"
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="devtools-body" ref={bodyRef}>
        {logs.length === 0 ? (
          <div style={{ color: '#6b7280', padding: 8 }}>Waiting for WebSocket traffic...</div>
        ) : (
          logs.map((log, index) => {
            const isOut = log.direction === 'OUT';
            const timeStr = new Date(log.time).toLocaleTimeString();
            return (
              <div key={index} className="log-entry">
                <span style={{ color: '#9ca3af', flexShrink: 0 }}>[{timeStr}]</span>
                <span className={isOut ? 'log-tag-out' : 'log-tag-in'} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {isOut ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                  {isOut ? 'OUT' : 'IN '}
                </span>
                <span style={{ color: '#fbbf24', fontWeight: 'bold', flexShrink: 0 }}>
                  {log.envelope.event}
                </span>
                <span style={{ color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {JSON.stringify(log.envelope.data)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
