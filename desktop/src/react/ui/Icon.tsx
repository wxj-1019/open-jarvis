import type { LucideProps } from 'lucide-react';

export interface IconProps {
  icon: React.ComponentType<LucideProps>;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({
  icon: IconComponent,
  size = 14,
  className,
  style,
  ...rest
}: IconProps) {
  return <IconComponent size={size} className={className} style={style} {...rest} />;
}
