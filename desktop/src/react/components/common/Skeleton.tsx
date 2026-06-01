import { memo } from 'react';
import './Skeleton.css';

interface SkeletonProps {
  variant?: 'text' | 'title' | 'avatar' | 'avatar-large' | 'image' | 'button' | 'input' | 'card' | 'message' | 'settings-section';
  width?: string;
  height?: string;
  className?: string;
  count?: number;
}

export const Skeleton = memo(function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
}: SkeletonProps) {
  const variantClass = `skeleton-${variant}`;
  const style = { width, height };

  if (variant === 'message') {
    return (
      <div className={`skeleton-message ${className}`}>
        <div className="skeleton skeleton-avatar" />
        <div className="skeleton-message-content">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="skeleton skeleton-text" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'settings-section') {
    return (
      <div className={`skeleton-settings-section ${className}`}>
        <div className="skeleton skeleton-title" style={{ width: '40%' }} />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton-settings-row">
            <div className="skeleton skeleton-text" style={{ width: '60%' }} />
            <div className="skeleton skeleton-button" style={{ width: '80px', height: '32px' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${variantClass} skeleton ${className}`}
          style={style}
        />
      ))}
    </>
  );
});
