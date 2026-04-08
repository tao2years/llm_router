'use client';

import { useState, useCallback } from 'react';

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

interface JsonNodeProps {
  value: JsonValue;
  depth?: number;
  defaultExpand?: number; // auto-expand levels
}

function isObject(v: JsonValue): v is { [k: string]: JsonValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const TRUNCATE_AT = 300;

function JsonString({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = value.length > TRUNCATE_AT;
  const display = long && !expanded ? value.slice(0, TRUNCATE_AT) : value;
  return (
    <span className="json-str">
      "{display}
      {long && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-blue-400 hover:text-blue-200 ml-1 text-xs not-italic"
        >
          …+{value.length - TRUNCATE_AT} more
        </button>
      )}
      {long && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-blue-400 hover:text-blue-200 ml-1 text-xs not-italic"
        >
          ▴ collapse
        </button>
      )}
      "
    </span>
  );
}

function Primitive({ value }: { value: JsonValue }) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'boolean') return <span className="json-bool">{String(value)}</span>;
  if (typeof value === 'number') return <span className="json-num">{value}</span>;
  if (typeof value === 'string') return <JsonString value={value} />;
  return <span>{String(value)}</span>;
}

function Collapsible({
  label,
  children,
  count,
  defaultOpen,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  count: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen(o => !o), []);

  return (
    <span>
      <button
        onClick={toggle}
        className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-200 transition-colors"
        aria-label={open ? 'collapse' : 'expand'}
      >
        <span className="text-xs leading-none select-none">{open ? '▾' : '▸'}</span>
      </button>
      {label}
      {!open && (
        <span className="text-gray-500 text-xs ml-1 cursor-pointer" onClick={toggle}>
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      )}
      {open && <>{children}</>}
    </span>
  );
}

export function JsonNode({ value, depth = 0, defaultExpand = 2 }: JsonNodeProps) {
  const indent = '  '.repeat(depth + 1);
  const closingIndent = '  '.repeat(depth);
  const defaultOpen = depth < defaultExpand;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">{'[]'}</span>;
    return (
      <span>
        <Collapsible
          label={<span className="text-gray-400">{'['}</span>}
          count={value.length}
          defaultOpen={defaultOpen}
        >
          <div>
            {value.map((item, i) => (
              <div key={i} className="ml-4">
                <span className="text-gray-600 text-xs select-none">{indent}</span>
                <JsonNode value={item} depth={depth + 1} defaultExpand={defaultExpand} />
                {i < value.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            ))}
            <span className="text-gray-400">{closingIndent}{']'}</span>
          </div>
        </Collapsible>
      </span>
    );
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span className="text-gray-400">{'{}'}</span>;
    return (
      <span>
        <Collapsible
          label={<span className="text-gray-400">{'{'}</span>}
          count={keys.length}
          defaultOpen={defaultOpen}
        >
          <div>
            {keys.map((key, i) => (
              <div key={key} className="ml-4">
                <span className="text-gray-600 text-xs select-none">{indent}</span>
                <span className="json-key">"{key}"</span>
                <span className="text-gray-400">: </span>
                <JsonNode value={value[key]} depth={depth + 1} defaultExpand={defaultExpand} />
                {i < keys.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            ))}
            <span className="text-gray-400">{closingIndent}{'}'}</span>
          </div>
        </Collapsible>
      </span>
    );
  }

  return <Primitive value={value} />;
}

interface JsonViewerProps {
  data: unknown;
  defaultExpand?: number;
  className?: string;
}

export default function JsonViewer({ data, defaultExpand = 2, className = '' }: JsonViewerProps) {
  let parsed: JsonValue;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data) as JsonValue; }
    catch { return <pre className={`text-gray-300 whitespace-pre-wrap break-all text-xs ${className}`}>{data}</pre>; }
  } else {
    parsed = data as JsonValue;
  }

  return (
    <pre className={`text-xs leading-5 whitespace-pre-wrap break-all select-text ${className}`}>
      <JsonNode value={parsed} depth={0} defaultExpand={defaultExpand} />
    </pre>
  );
}
