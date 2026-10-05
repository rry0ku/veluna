import React, { useState, useRef, useLayoutEffect } from 'react';

import { getZoomFactor } from '../utils';

interface VirtualTrackListProps<T> {
  items: T[];
  itemHeight?: number;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
}

export function VirtualTrackList<T>({
  items,
  itemHeight = 56,
  overscan = 8,
  className,
  style,
  renderItem,
  keyExtractor,
}: VirtualTrackListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ scrollTop: 0, viewportHeight: 800 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      const overflow = window.getComputedStyle(scrollParent).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        break;
      }
      scrollParent = scrollParent.parentElement;
    }

    const updateScroll = () => {
      if (!containerRef.current) return;
      
      const zoom = getZoomFactor();
      const parentRect = scrollParent ? scrollParent.getBoundingClientRect() : { top: 0 };
      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeTop = (parentRect.top - containerRect.top) / zoom;
      const viewportH = scrollParent ? scrollParent.clientHeight : (window.innerHeight / zoom);

      setScrollState({
        scrollTop: Math.max(0, relativeTop),
        viewportHeight: viewportH,
      });
    };

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updateScroll();
        rafId = null;
      });
    };

    updateScroll();

    if (scrollParent) {
      scrollParent.addEventListener('scroll', onScroll, { passive: true });
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', onScroll);
      } else {
        window.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('resize', onScroll);
    };
  }, [items]);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollState.scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, Math.ceil((scrollState.scrollTop + scrollState.viewportHeight) / itemHeight) + overscan);

  const visibleItems = items.slice(startIndex, endIndex);
  const paddingTop = startIndex * itemHeight;
  const paddingBottom = Math.max(0, (items.length - endIndex) * itemHeight);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        minHeight: totalHeight > 0 ? `${totalHeight}px` : 'auto',
        boxSizing: 'border-box',
        contain: 'layout style',
        ...style,
      }}
    >
      <div
        style={{
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`,
          boxSizing: 'border-box',
        }}
      >
        {visibleItems.map((item, idx) => {
          const actualIndex = startIndex + idx;
          const key = keyExtractor ? keyExtractor(item, actualIndex) : (item as any)?.id || (item as any)?.url || actualIndex;
          return (
            <React.Fragment key={key}>
              {renderItem(item, actualIndex)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
