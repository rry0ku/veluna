import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

type ThemedSelectProps = {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  minWidth?: string;
  buttonStyle?: React.CSSProperties;
  compact?: boolean;
};

export const ThemedSelect = ({ value, options, onChange, icon, minWidth, buttonStyle, compact }: ThemedSelectProps) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    minWidth: number;
    maxHeight: number;
  } | null>(null);

  const current = options.find(o => o.value === value) || options[0];

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();

    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false);
      return;
    }

    const itemHeight = compact ? 30 : 36;
    const estimatedHeight = Math.min(320, options.length * itemHeight + 10);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const right = Math.max(8, window.innerWidth - rect.right);
    const parsedMinW = minWidth ? parseInt(minWidth, 10) : (compact ? 95 : 130);
    const minW = Math.max(rect.width, isNaN(parsedMinW) ? (compact ? 95 : 130) : parsedMinW);

    if (openUpwards) {
      setMenuCoords({
        bottom: window.innerHeight - rect.top + 4,
        right,
        minWidth: minW,
        maxHeight: Math.min(320, Math.max(120, spaceAbove - 16)),
      });
    } else {
      setMenuCoords({
        top: rect.bottom + 4,
        right,
        minWidth: minW,
        maxHeight: Math.min(320, Math.max(120, spaceBelow - 16)),
      });
    }
  }, [options.length, compact, minWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(t) &&
        menuRef.current && !menuRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, updatePosition]);

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? '6px' : '8px',
          padding: compact ? '4px 8px' : '7px 12px',
          borderRadius: compact ? '7px' : '10px',
          fontSize: compact ? '11px' : '13px',
          fontWeight: 500,
          border: open ? '1px solid var(--v-bdr2)' : '1px solid var(--v-bdr)',
          outline: 'none',
          background: open ? 'var(--v-bg3)' : 'var(--v-bg2)',
          color: open ? 'var(--v-fg)' : 'var(--v-fg2)',
          cursor: 'pointer',
          minWidth: minWidth || (compact ? '90px' : '130px'),
          boxSizing: 'border-box',
          transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
          ...buttonStyle
        }}
        onMouseEnter={e => {
          if (!open) {
            (e.currentTarget as HTMLElement).style.background = 'var(--v-bg3)';
            (e.currentTarget as HTMLElement).style.color = 'var(--v-fg)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--v-bdr2)';
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            (e.currentTarget as HTMLElement).style.background = 'var(--v-bg2)';
            (e.currentTarget as HTMLElement).style.color = 'var(--v-fg2)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--v-bdr)';
          }
        }}
      >
        {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current?.label}</span>
        <ChevronDown size={compact ? 12 : 14} style={{ transition: 'transform .2s cubic-bezier(0.16, 1, 0.3, 1)', transform: open ? 'rotate(180deg)' : 'none', opacity: 0.7, flexShrink: 0 }} />
      </button>

      {open && menuCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuCoords.top !== undefined ? `${menuCoords.top}px` : undefined,
            bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : undefined,
            right: `${menuCoords.right}px`,
            minWidth: `${menuCoords.minWidth}px`,
            width: 'max-content',
            maxWidth: '320px',
            maxHeight: `${menuCoords.maxHeight}px`,
            overflowY: 'auto',
            boxSizing: 'border-box',
            zIndex: 999999,
            animation: 'dropIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            background: 'var(--v-bg2)',
            border: '1px solid var(--v-bdr2)',
            borderRadius: compact ? '8px' : '10px',
            padding: compact ? '2px' : '3px',
            boxShadow: '0 20px 48px rgba(0,0,0,0.85), 0 2px 10px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value}
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(opt.value);
                  setOpen(false);
                }}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: compact ? '5px 8px' : '6px 10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: compact ? '6px' : '7px',
                  background: isSelected ? 'var(--v-bg3)' : 'transparent',
                  border: isSelected ? '1px solid var(--v-bdr2)' : '1px solid transparent',
                  outline: 'none',
                  transition: 'all 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
                  gap: compact ? '6px' : '8px',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--v-bg3)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                <span style={{
                  fontSize: compact ? '11.5px' : '12.5px',
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'var(--v-accent)' : 'var(--v-fg)',
                  letterSpacing: '-0.01em',
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {opt.label}
                </span>
                {isSelected && (
                  <Check size={compact ? 12 : 13} style={{ color: 'var(--v-accent)', flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
