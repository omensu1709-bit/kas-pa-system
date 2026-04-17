import { useEffect, useRef, useState } from 'react';

interface Props {
  data: Record<string, any>[];
  schema: Record<string, string>;
  className?: string;
}

export default function StreamingTable({ data, className = '' }: Props) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data.length > 0) {
      setRows(prev => [...prev, ...data].slice(-500));
    }
  }, [data]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className={className} style={{ padding: 20, color: '#888' }}>
        <p>Warte auf Daten vom Backend...</p>
        <p>Verbinde mit Port 8080</p>
      </div>
    );
  }

  const columns = Object.keys(rows[0] || {});

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px', background: '#1a1a2e', color: '#00ff88', fontSize: 12 }}>
        Zeilen: {rows.length} | Letzte Aktualisierung: {new Date().toLocaleTimeString()}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#16213e' }}>
            <tr>
              {columns.map(col => (
                <th key={col} style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #333', color: '#00ff88' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(-100).reverse().map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#0f0f23' : '#1a1a2e' }}>
                {columns.map(col => (
                  <td key={col} style={{ padding: '6px', borderBottom: '1px solid #222', color: '#fff' }}>
                    {typeof row[col] === 'number' ? row[col].toFixed(6) : String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
