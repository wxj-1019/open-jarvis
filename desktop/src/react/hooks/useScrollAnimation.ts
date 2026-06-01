import { useEffect, useRef, useState, useCallback } from 'react';

interface UseScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
  delay?: number;
}

/**
 * 滚动触发动画 Hook
 * 使用 Intersection Observer API 检测元素是否进入视口
 */
export function useScrollAnimation({
  threshold = 0.1,
  rootMargin = '0px',
  triggerOnce = true,
  delay = 0,
}: UseScrollAnimationOptions = {}): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          setIsVisible(true);
        }, delay);
        
        if (triggerOnce) {
          observer.current?.unobserve(entry.target);
        }
      } else if (!triggerOnce) {
        setIsVisible(false);
      }
    });
  }, [triggerOnce, delay]);

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    observer.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin,
    });

    observer.current.observe(element);

    return () => {
      if (observer.current && element) {
        observer.current.unobserve(element);
      }
    };
  }, [threshold, rootMargin, handleIntersection]);

  return [ref, isVisible];
}

/**
 * 批量滚动触发动画 Hook
 * 用于多个子元素依次入场的场景
 */
export function useBatchScrollAnimation({
  threshold = 0.1,
  rootMargin = '0px',
  staggerDelay = 80,
}: UseScrollAnimationOptions & { staggerDelay?: number } = {}): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const children = Array.from(element.children);
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = children.indexOf(entry.target as Element);
          if (index !== -1 && index >= visibleCount) {
            setTimeout(() => {
              setVisibleCount(index + 1);
            }, index * staggerDelay);
          }
          observer.unobserve(entry.target);
        }
      });
    }, { threshold, rootMargin });

    children.forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [threshold, rootMargin, staggerDelay, visibleCount]);

  return [ref, visibleCount];
}
