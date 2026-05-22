import type { IconProps } from "@phosphor-icons/react";

export interface PhosphorIconProps {
  icon: React.ComponentType<IconProps>;
  size?: number;
  weight?: IconProps["weight"];
  className?: string;
  style?: React.CSSProperties;
}

export function PhosphorIcon({
  icon: IconComponent,
  size = 14,
  weight = "regular",
  className,
  ...rest
}: PhosphorIconProps) {
  return <IconComponent size={size} weight={weight} className={className} {...rest} />;
}
